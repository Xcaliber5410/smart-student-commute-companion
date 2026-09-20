const express = require('express');
const { z } = require('zod');
const { db, resetDemo } = require('../db/database');
const { geocodeArea } = require('../services/geocodingService');
const { getOsrmRoute } = require('../services/routingService');
const { getMumbaiWeather } = require('../services/weatherService');
const { findTransitCandidates, findNearbyStops } = require('../services/gtfsService');
const { getActiveReports, evaluateRouteDisruptions } = require('../services/disruptionService');
const { scoreRoutes } = require('../services/scoringService');
const { generateAiRecommendation } = require('../services/aiPlannerService');

module.exports = function createApiRouter(io) {
  const router = express.Router();

  // 1. Health check
  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'Smart Student Commute Companion API',
      city: 'Mumbai',
      timestamp: new Date().toISOString()
    });
  });

  // 2. Commute Planner API
  const planSchema = z.object({
    origin: z.string().min(2, 'Origin area is required'),
    destination: z.string().min(2, 'Destination college is required'),
    desiredArrivalTime: z.string().optional().default('09:00'),
    preferredModes: z.array(z.string()).optional().default(['train', 'metro', 'bus', 'auto', 'walk']),
    preference: z.enum(['balanced', 'fastest', 'cheapest', 'rain-safe']).optional().default('balanced'),
    walkingToleranceMinutes: z.number().min(5).max(60).optional().default(20),
    maxBudgetRupees: z.number().min(0).max(2000).optional().default(100)
  });

  router.post('/plan', async (req, res) => {
    try {
      const parsed = planSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      const { origin, destination, desiredArrivalTime, preferredModes, preference, walkingToleranceMinutes, maxBudgetRupees } = parsed.data;

      // 1. Geocode origin and destination
      const [originGeo, destGeo] = await Promise.all([
        geocodeArea(origin),
        geocodeArea(destination)
      ]);

      // 2. Fetch live weather & active community reports concurrently
      const [weather, activeReports] = await Promise.all([
        getMumbaiWeather(originGeo.lat, originGeo.lon),
        Promise.resolve(getActiveReports())
      ]);

      // 3. Generate candidate routes from Mumbai GTFS and OSRM with strict allowed modes
      const rawCandidates = findTransitCandidates(originGeo, destGeo, desiredArrivalTime, preferredModes);

      // Strict budget filter: If options exist within max budget, eliminate all exceeding options
      const withinBudgetCandidates = rawCandidates.filter(c => c.fareRupees <= maxBudgetRupees);
      const candidates = withinBudgetCandidates.length > 0 ? withinBudgetCandidates : rawCandidates;

      // 4. Enrich candidates with road/walking geometry from OSRM
      const enrichedCandidates = await Promise.all(
        candidates.map(async (cand) => {
          // If auto route or pure walk, fetch full road geometry
          if (cand.primaryMode === 'auto' || cand.primaryMode === 'walk') {
            const osrmData = await getOsrmRoute(originGeo, destGeo, cand.primaryMode === 'walk' ? 'walking' : 'driving');
            return {
              ...cand,
              geometry: osrmData.geometry,
              osrmSource: osrmData.source
            };
          }

          // For transit routes, build geometry: origin -> first stop -> dest stop -> destination
          if (cand.transitStations && cand.transitStations.length >= 2) {
            const station1 = cand.transitStations[0];
            const stationLast = cand.transitStations[cand.transitStations.length - 1];

            // Build GeoJSON coordinate array
            const coordinates = [
              [originGeo.lon, originGeo.lat],
              [station1.lon, station1.lat],
              ...cand.transitStations.slice(1, -1).map(s => [s.lon, s.lat]),
              [stationLast.lon, stationLast.lat],
              [destGeo.lon, destGeo.lat]
            ];

            return {
              ...cand,
              geometry: {
                type: 'LineString',
                coordinates
              }
            };
          }

          return cand;
        })
      );

      // 5. Evaluate community disruptions against candidates
      const disruptionEvals = {};
      enrichedCandidates.forEach(cand => {
        disruptionEvals[cand.id] = evaluateRouteDisruptions(cand, activeReports);
      });

      // 6. Deterministic scoring
      const scoringResults = scoreRoutes(
        enrichedCandidates,
        weather,
        { preference, walkingToleranceMinutes, maxBudgetRupees },
        disruptionEvals
      );

      // If no valid route found, return structured empty result
      if (!scoringResults.recommended) {
        return res.json({
          success: true,
          query: {
            origin: originGeo,
            destination: destGeo,
            desiredArrivalTime,
            preference,
            maxBudgetRupees,
            preferredModes
          },
          weather,
          recommendation: {
            route: null,
            aiReasoning: {
              recommendedRouteId: null,
              departureTime: null,
              summary: 'No routes match your selected modes and budget constraints.',
              reason: `No transit options were found within your max budget of ₹${maxBudgetRupees} using the allowed modes (${preferredModes.join(', ')}). Try increasing your budget or selecting more transport modes.`,
              warnings: ['No matching routes found for current filter settings.'],
              confidence: 'none',
              aiProvider: 'Smart Commute Filter Engine'
            }
          },
          alternatives: [],
          allCandidatesCount: 0
        });
      }

      // 7. Grounded AI explanation via Gemini 3.8 Flash (or deterministic fallback)
      const aiExplanation = await generateAiRecommendation(
        scoringResults.rankedCandidates,
        scoringResults,
        weather,
        activeReports,
        { preference, walkingToleranceMinutes, maxBudgetRupees },
        desiredArrivalTime
      );

      // Find the route recommended by AI or default to scoring engine's top choice
      let recommendedRoute = scoringResults.rankedCandidates.find(c => c.id === aiExplanation.recommendedRouteId);
      if (!recommendedRoute) {
        recommendedRoute = scoringResults.recommended;
      }

      // Collect distinct alternative routes strictly within budget
      const alternatives = scoringResults.rankedCandidates.filter(c => 
        c.id !== recommendedRoute.id && (withinBudgetCandidates.length === 0 || c.fareRupees <= maxBudgetRupees)
      );
      const practicalAlternatives = [];

      // Add fastest alternative (if within budget)
      if (scoringResults.fastestAlternative && 
          scoringResults.fastestAlternative.id !== recommendedRoute.id &&
          (withinBudgetCandidates.length === 0 || scoringResults.fastestAlternative.fareRupees <= maxBudgetRupees)) {
        practicalAlternatives.push({
          ...scoringResults.fastestAlternative,
          badgeLabel: 'Fastest Alternative'
        });
      }

      // Add cheapest alternative (if within budget)
      if (scoringResults.cheapestAlternative &&
          scoringResults.cheapestAlternative.id !== recommendedRoute.id &&
          (withinBudgetCandidates.length === 0 || scoringResults.cheapestAlternative.fareRupees <= maxBudgetRupees) &&
          !practicalAlternatives.some(a => a.id === scoringResults.cheapestAlternative.id)) {
        practicalAlternatives.push({
          ...scoringResults.cheapestAlternative,
          badgeLabel: 'Lowest-Cost Alternative'
        });
      }

      // Add rain-safe alternative (if within budget)
      if (scoringResults.rainSafeAlternative &&
          scoringResults.rainSafeAlternative.id !== recommendedRoute.id &&
          (withinBudgetCandidates.length === 0 || scoringResults.rainSafeAlternative.fareRupees <= maxBudgetRupees) &&
          !practicalAlternatives.some(a => a.id === scoringResults.rainSafeAlternative.id)) {
        practicalAlternatives.push({
          ...scoringResults.rainSafeAlternative,
          badgeLabel: 'Rain-Safe Alternative'
        });
      }

      // Fill remaining alternatives if fewer than 2
      for (const alt of alternatives) {
        if (practicalAlternatives.length >= 2) break;
        if (!practicalAlternatives.some(a => a.id === alt.id)) {
          practicalAlternatives.push({
            ...alt,
            badgeLabel: 'Alternative Route'
          });
        }
      }

      res.json({
        success: true,
        query: {
          origin: originGeo,
          destination: destGeo,
          desiredArrivalTime,
          preference
        },
        weather,
        recommendation: {
          route: recommendedRoute,
          aiReasoning: aiExplanation
        },
        alternatives: practicalAlternatives,
        allCandidatesCount: enrichedCandidates.length,
        disruptionReportsConsidered: activeReports.length
      });
    } catch (err) {
      console.error('Plan error:', err);
      res.status(500).json({
        error: 'Failed to generate commute plan',
        message: err.message
      });
    }
  });

  // 3. Live Community Reports APIs
  router.get('/live-reports', (req, res) => {
    try {
      const reports = getActiveReports();
      res.json({
        success: true,
        count: reports.length,
        reports
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Alias for alerts
  router.get('/alerts', (req, res) => {
    try {
      const reports = getActiveReports();
      res.json({
        success: true,
        alerts: reports.map(r => ({
          id: r.id,
          title: `⚠ ${r.area} (${r.mode.toUpperCase()})`,
          message: r.message,
          impact: r.impact,
          age: r.ageFormatted,
          confirmations: r.confirmation_count
        }))
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const reportSchema = z.object({
    pseudonym: z.string().min(2).max(30).optional().default('Student_Rider'),
    area: z.string().min(2),
    route_name: z.string().optional().default('General Corridor'),
    route_id: z.string().optional().default(''),
    mode: z.enum(['train', 'metro', 'bus', 'auto', 'walk']),
    message: z.string().min(5).max(250),
    impact: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    durationObservedMinutes: z.number().optional().default(60)
  });

  // Handler for creating a report
  const createReportHandler = (req, res) => {
    try {
      const parsed = reportSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      const { pseudonym, area, route_name, route_id, mode, message, impact, durationObservedMinutes } = parsed.data;
      const now = Date.now();
      const expiresAt = now + (durationObservedMinutes || 60) * 60 * 1000;
      const reportId = `rep-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

      const stmt = db.prepare(`
        INSERT INTO live_commute_reports 
        (id, pseudonym, area, route_name, route_id, mode, message, impact, status, created_at, expires_at, confirmation_count, contradiction_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, 1, 0)
      `);

      stmt.run(reportId, pseudonym, area, route_name, route_id, mode, message, impact, now, expiresAt);

      const createdReport = {
        id: reportId,
        pseudonym,
        area,
        route_name,
        route_id,
        mode,
        message,
        impact,
        status: 'active',
        created_at: now,
        expires_at: expiresAt,
        confirmation_count: 1,
        contradiction_count: 0,
        freshnessWeight: 1.0,
        ageMinutes: 0,
        ageFormatted: 'Just now'
      };

      // Broadcast to connected students via Socket.IO
      if (io) {
        io.emit('live_report_created', createdReport);
      }

      res.status(201).json({
        success: true,
        message: 'Community report posted successfully',
        report: createdReport
      });
    } catch (err) {
      console.error('Create report error:', err);
      res.status(500).json({ error: err.message });
    }
  };

  router.post('/live-reports', createReportHandler);
  router.post('/reports', createReportHandler);

  // Still happening (Confirm)
  router.post('/live-reports/:id/confirm', (req, res) => {
    try {
      const { id } = req.params;
      const userToken = req.headers['x-user-token'] || req.ip || 'anon-user';

      // Record confirmation vote if not already voted
      const checkStmt = db.prepare('SELECT * FROM live_report_confirmations WHERE report_id = ? AND user_token = ?');
      const existing = checkStmt.get(id, userToken);

      if (existing) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      db.prepare('INSERT INTO live_report_confirmations (report_id, user_token, action, created_at) VALUES (?, ?, ?, ?)')
        .run(id, userToken, 'confirm', Date.now());

      db.prepare('UPDATE live_commute_reports SET confirmation_count = confirmation_count + 1 WHERE id = ?').run(id);

      const updatedReport = db.prepare('SELECT * FROM live_commute_reports WHERE id = ?').get(id);

      if (io) {
        io.emit('live_report_updated', updatedReport);
      }

      res.json({
        success: true,
        message: 'Confirmed that disruption is still happening',
        report: updatedReport
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // No longer happening (Contradict)
  router.post('/live-reports/:id/contradict', (req, res) => {
    try {
      const { id } = req.params;
      const userToken = req.headers['x-user-token'] || req.ip || 'anon-user';

      const checkStmt = db.prepare('SELECT * FROM live_report_confirmations WHERE report_id = ? AND user_token = ?');
      const existing = checkStmt.get(id, userToken);

      if (existing) {
        return res.json({ success: true, message: 'Vote already recorded', alreadyVoted: true });
      }

      db.prepare('INSERT INTO live_report_confirmations (report_id, user_token, action, created_at) VALUES (?, ?, ?, ?)')
        .run(id, userToken, 'contradict', Date.now());

      db.prepare('UPDATE live_commute_reports SET contradiction_count = contradiction_count + 1 WHERE id = ?').run(id);

      const updatedReport = db.prepare('SELECT * FROM live_commute_reports WHERE id = ?').get(id);

      // If contradictions significantly outnumber confirmations, auto-expire
      if (updatedReport.contradiction_count >= updatedReport.confirmation_count + 3) {
        db.prepare("UPDATE live_commute_reports SET status = 'expired' WHERE id = ?").run(id);
        if (io) {
          io.emit('live_report_expired', { id });
        }
      } else if (io) {
        io.emit('live_report_updated', updatedReport);
      }

      res.json({
        success: true,
        message: 'Recorded update that disruption cleared up',
        report: updatedReport
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Transit search API
  router.get('/transit/search', (req, res) => {
    try {
      const { q, lat, lon } = req.query;
      if (lat && lon) {
        const stops = findNearbyStops(parseFloat(lat), parseFloat(lon), 4000);
        return res.json({ success: true, stops });
      }
      const query = (q || '').trim();
      const stops = db.prepare('SELECT * FROM gtfs_stops WHERE stop_name LIKE ? LIMIT 15').all(`%${query}%`);
      const routes = db.prepare('SELECT * FROM gtfs_routes WHERE route_short_name LIKE ? OR route_long_name LIKE ? LIMIT 15').all(`%${query}%`, `%${query}%`);
      res.json({ success: true, stops, routes });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 5. Travel Together (Ride Groups) APIs
  router.get('/ride-groups', (req, res) => {
    try {
      const groups = db.prepare('SELECT * FROM ride_groups ORDER BY created_at DESC LIMIT 20').all();
      res.json({ success: true, groups });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  const rideGroupSchema = z.object({
    creator_pseudonym: z.string().min(2),
    origin_area: z.string().min(2),
    destination_college: z.string().min(2),
    departure_time: z.string().min(2),
    mode: z.string().min(2),
    max_members: z.number().min(2).max(6).optional().default(3),
    notes: z.string().optional().default('')
  });

  router.post('/ride-groups', (req, res) => {
    try {
      const parsed = rideGroupSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      const { creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, notes } = parsed.data;
      const groupId = `grp-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;

      db.prepare(`
        INSERT INTO ride_groups 
        (id, creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, current_members, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(groupId, creator_pseudonym, origin_area, destination_college, departure_time, mode, max_members, notes, Date.now());

      const created = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(groupId);
      res.status(201).json({ success: true, group: created });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/ride-groups/:id/join', (req, res) => {
    try {
      const { id } = req.params;
      const group = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(id);
      if (!group) return res.status(404).json({ error: 'Ride group not found' });
      if (group.current_members >= group.max_members) {
        return res.status(400).json({ error: 'This group is already full' });
      }

      db.prepare('UPDATE ride_groups SET current_members = current_members + 1 WHERE id = ?').run(id);
      const updated = db.prepare('SELECT * FROM ride_groups WHERE id = ?').get(id);
      res.json({ success: true, message: 'Joined commute group successfully!', group: updated });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 6. Feedback API
  const feedbackSchema = z.object({
    recommendation_id: z.string().optional().default(''),
    is_useful: z.boolean(),
    tags: z.array(z.string()).optional().default([]),
    comment: z.string().optional().default('')
  });

  router.post('/feedback', (req, res) => {
    try {
      const parsed = feedbackSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Validation failed', details: parsed.error.format() });
      }

      const { recommendation_id, is_useful, tags, comment } = parsed.data;
      const id = `fb-${Date.now()}`;
      db.prepare(`
        INSERT INTO feedback (id, recommendation_id, is_useful, tags, comment, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, recommendation_id, is_useful ? 1 : 0, JSON.stringify(tags), comment, Date.now());

      res.status(201).json({ success: true, message: 'Thank you for your student feedback!' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 7. Demo Reset API
  router.post('/demo/reset', (req, res) => {
    try {
      const result = resetDemo();
      const freshReports = getActiveReports();
      if (io) {
        io.emit('demo_reset', { freshReports });
      }
      res.json({ success: true, ...result, reportsCount: freshReports.length });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
};
