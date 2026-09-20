const axios = require('axios');

/**
 * Builds deterministic grounded explanation when Gemini is unavailable or fails
 */
function buildDeterministicExplanation(recommendedRoute, scoringResults, weather, activeReports, userPreferences) {
  if (!recommendedRoute) {
    return {
      recommendedRouteId: null,
      departureTime: null,
      summary: 'No routes match your selected modes and budget constraints.',
      reason: `No transit options were found within your max budget of ₹${userPreferences.maxBudgetRupees || 100}. Try relaxing your mode filters or increasing your budget limit.`,
      warnings: ['No matching routes found.'],
      confidence: 'none',
      aiProvider: 'Deterministic Grounded Engine'
    };
  }

  const warnings = [];

  // Weather warning
  if (weather && weather.rainProbability > 40) {
    warnings.push(`High rain probability (${weather.rainProbability}%). Outdoor walking legs carry elevated delay and soaking risk.`);
  }

  // Disruption warnings
  if (recommendedRoute.disruptionAlerts && recommendedRoute.disruptionAlerts.length > 0) {
    recommendedRoute.disruptionAlerts.forEach(a => {
      warnings.push(`⚠ Community report in ${a.area}: "${a.message}" (${a.ageFormatted})`);
    });
  }

  // Explaining why the recommended option is best
  const rec = recommendedRoute;
  const pref = userPreferences.preference || 'balanced';
  const fastAlt = scoringResults.fastestAlternative;
  const cheapAlt = scoringResults.cheapestAlternative;

  let reason = '';
  if (pref === 'fastest') {
    reason = `${rec.title} is selected because it delivers the earliest estimated arrival at ${rec.estimatedArrival} (${rec.durationMinutes} mins total duration) with minimal transfer friction.`;
  } else if (pref === 'cheapest') {
    reason = `${rec.title} is the most economical student option at ₹${rec.fareRupees}, saving up to ₹${Math.max(0, (fastAlt?.fareRupees || rec.fareRupees) - rec.fareRupees)} compared to road alternatives while maintaining reliable scheduled headway.`;
  } else if (pref === 'rain-safe') {
    reason = `${rec.title} maximizes sheltered transit with only ${rec.walkingDurationMinutes} mins of outdoor walking exposure, protecting against the ${weather.condition} forecast.`;
  } else {
    // Balanced
    reason = `${rec.title} provides the optimal balance of travel time (${rec.durationMinutes} mins), student-friendly fare (₹${rec.fareRupees}), and high transit reliability (${rec.scores?.reliability || 85}% index).`;
  }

  if (rec.disruptionAlerts && rec.disruptionAlerts.length > 0) {
    reason += ` Note: Although community reports flagged moderate congestion in ${rec.disruptionAlerts[0].area}, this route remains the strongest option due to dedicated right-of-way advantages.`;
  }

  const summary = `Recommended: ${rec.title} via ${rec.subtitle} (Est. ${rec.durationMinutes} mins, ₹${rec.fareRupees}). Depart by ${rec.estimatedDeparture} to reach on time.`;

  return {
    recommendedRouteId: rec.id,
    departureTime: rec.estimatedDeparture,
    summary,
    reason,
    warnings,
    confidence: rec.transfers === 0 ? 'high' : 'medium',
    aiProvider: 'Deterministic Grounded Engine (Fallback)'
  };
}

/**
 * Plans and explains recommendations using Gemini with strict grounding
 */
async function generateAiRecommendation(candidates, scoringResults, weather, activeReports, userPreferences, targetArrival) {
  const recommendedRoute = scoringResults.recommended;
  if (!recommendedRoute || !candidates || candidates.length === 0) {
    return buildDeterministicExplanation(null, scoringResults, weather, activeReports, userPreferences);
  }

  const apiKey = process.env.GEMINI_API_KEY || '';

  // If no API key is provided, return deterministic explanation immediately
  if (!apiKey || apiKey.trim() === '') {
    return buildDeterministicExplanation(recommendedRoute, scoringResults, weather, activeReports, userPreferences);
  }

  try {
    // Attempt using official SDK or direct Gemini REST endpoint
    let GoogleGenAI;
    try {
      GoogleGenAI = require('@google/genai').GoogleGenAI;
    } catch (e) {
      GoogleGenAI = null;
    }

    const promptPayload = {
      role: 'user',
      task: 'Recommend and explain the best student commute option among the provided factual candidates.',
      userPreferences: {
        desiredArrival: targetArrival,
        preference: userPreferences.preference || 'balanced',
        walkingToleranceMinutes: userPreferences.walkingToleranceMinutes || 20,
        budgetRupees: userPreferences.maxBudgetRupees || 100
      },
      weatherFacts: {
        condition: weather.condition,
        temperatureC: weather.temperatureC,
        rainProbability: weather.rainProbability,
        rainRisk: weather.rainRisk
      },
      communityReports: (activeReports || []).slice(0, 5).map(r => ({
        area: r.area,
        mode: r.mode,
        message: r.message,
        impact: r.impact,
        age: r.ageFormatted,
        confirmationCount: r.confirmation_count
      })),
      candidateRoutes: candidates.map(c => ({
        id: c.id,
        title: c.title,
        subtitle: c.subtitle,
        primaryMode: c.primaryMode,
        durationMinutes: c.durationMinutes,
        walkingMinutes: c.walkingDurationMinutes,
        fareRupees: c.fareRupees,
        transfers: c.transfers,
        departureTime: c.estimatedDeparture,
        arrivalTime: c.estimatedArrival,
        compositeScore: c.scores?.composite || 75,
        disruptions: (c.disruptionAlerts || []).map(a => a.message)
      }))
    };

    const systemInstruction = `You are the Smart Student Commute Companion AI for Mumbai college commutes.
CRITICAL INSTRUCTIONS:
1. You must ONLY reason over the provided factual candidate routes, weather facts, and student community reports.
2. DO NOT INVENT or hallucinate routes, bus numbers, train numbers, station names, fares, travel times, weather conditions, or disruptions.
3. Select the best route matching the student's preferences (e.g. balanced, fastest, cheapest, rain-safe).
4. Explain clearly WHY the selected option is best compared to alternatives.
5. If community reports or weather impacted the recommendation, explicitly highlight it.
6. Output strictly valid JSON matching this schema:
{
  "recommendedRouteId": "string (must match one of the candidate IDs)",
  "departureTime": "string (e.g. '08:15 AM')",
  "summary": "string (1-2 sentences summarizing the commute)",
  "reason": "string (concise paragraph explaining why this route wins over alternatives)",
  "warnings": ["string", "string"],
  "confidence": "high" | "medium" | "low"
}`;

    if (GoogleGenAI) {
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          { role: 'user', parts: [{ text: `${systemInstruction}\n\nContext:\n${JSON.stringify(promptPayload, null, 2)}` }] }
        ],
        config: {
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: 2048 }
        }
      });

      if (response && response.text) {
        const parsed = JSON.parse(response.text.trim());
        return {
          ...parsed,
          aiProvider: 'Gemini 3.8 Flash (High Reasoning)'
        };
      }
    } else {
      // Direct REST fallback to generativelanguage API
      const restUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const restRes = await axios.post(restUrl, {
        contents: [
          { parts: [{ text: `${systemInstruction}\n\nContext:\n${JSON.stringify(promptPayload, null, 2)}` }] }
        ],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      }, { timeout: 7000 });

      const text = restRes.data.candidates[0].content.parts[0].text;
      const parsed = JSON.parse(text);
      return {
        ...parsed,
        aiProvider: 'Gemini 3.8 Flash'
      };
    }
  } catch (err) {
    console.warn(`Gemini AI inference failed: ${err.message}. Falling back to deterministic grounded engine.`);
  }

  return buildDeterministicExplanation(recommendedRoute, scoringResults, weather, activeReports, userPreferences);
}

module.exports = {
  generateAiRecommendation,
  buildDeterministicExplanation
};
