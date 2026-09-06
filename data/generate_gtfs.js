const fs = require('fs');
const path = require('path');

const gtfsDir = path.join(__dirname, 'gtfs');
if (!fs.existsSync(gtfsDir)) {
  fs.mkdirSync(gtfsDir, { recursive: true });
}

// 1. agency.txt
const agencyData = `agency_id,agency_name,agency_url,agency_timezone,agency_lang
WR,Western Railway,https://wr.indianrailways.gov.in,Asia/Kolkata,en
CR,Central Railway,https://cr.indianrailways.gov.in,Asia/Kolkata,en
MMRDA,Maha Mumbai Metro,https://www.mmmocl.co.in,Asia/Kolkata,en
BEST,Brihanmumbai Electric Supply and Transport,https://www.bestundertaking.com,Asia/Kolkata,en
`;
fs.writeFileSync(path.join(gtfsDir, 'agency.txt'), agencyData.trim());

// 2. routes.txt
const routesData = `route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color
WR_SLOW,WR,WR-SL,Western Line (Slow - All Stops),2,E11D48,FFFFFF
WR_FAST,WR,WR-FT,Western Line (Fast),2,BE123C,FFFFFF
CR_SLOW,CR,CR-SL,Central Line (Slow - All Stops),2,1D4ED8,FFFFFF
CR_FAST,CR,CR-FT,Central Line (Fast),2,1E40AF,FFFFFF
HR_MAIN,CR,HR-SL,Harbour Line (CSMT - Panvel/Wadala),2,D97706,FFFFFF
METRO_1,MMRDA,Line 1,Metro Line 1 (Versova - Andheri - Ghatkopar),1,059669,FFFFFF
METRO_2A,MMRDA,Line 2A,Metro Line 2A (Dahisar East - Andheri West),1,F59E0B,000000
METRO_7,MMRDA,Line 7,Metro Line 7 (Dahisar East - Gundavali),1,EF4444,FFFFFF
METRO_3,MMRDA,Line 3,Metro Line 3 Aqua Line (Aarey JVLR - BKC),1,06B6D4,FFFFFF
BEST_418,BEST,Bus 418,Andheri Station (E) to IIT Main Gate / Powai,3,DC2626,FFFFFF
BEST_492,BEST,Bus 492,Thane Stn to SEEPZ via IIT Powai,3,DC2626,FFFFFF
BEST_203,BEST,Bus 203,Dahisar Bridge to Juhu via Andheri West,3,DC2626,FFFFFF
BEST_60,BEST,Bus 60,Matunga Station to VJTI / Wadala,3,DC2626,FFFFFF
BEST_138,BEST,Bus 138,Churchgate Stn to CSMT / Fort Colleges,3,DC2626,FFFFFF
BEST_AS422,BEST,Bus AS-422,Agarkar Chowk Andheri to Powai Lake,3,DC2626,FFFFFF
`;
fs.writeFileSync(path.join(gtfsDir, 'routes.txt'), routesData.trim());

// 3. stops.txt
const stops = [
  // Western Railway
  { id: 'ST_CCG', name: 'Churchgate Station', lat: 18.9322, lon: 72.8264 },
  { id: 'ST_MEL', name: 'Marine Lines Station', lat: 18.9438, lon: 72.8239 },
  { id: 'ST_MMCT', name: 'Mumbai Central Station', lat: 18.9696, lon: 72.8193 },
  { id: 'ST_DDR_WR', name: 'Dadar Station (WR)', lat: 19.0178, lon: 72.8432 },
  { id: 'ST_BA', name: 'Bandra Station', lat: 19.0544, lon: 72.8406 },
  { id: 'ST_VLP', name: 'Vile Parle Station', lat: 19.0999, lon: 72.8439 },
  { id: 'ST_ADH_WR', name: 'Andheri Station (WR)', lat: 19.1197, lon: 72.8464 },
  { id: 'ST_JOS', name: 'Jogeshwari Station', lat: 19.1352, lon: 72.8492 },
  { id: 'ST_GMN', name: 'Goregaon Station', lat: 19.1646, lon: 72.8494 },
  { id: 'ST_MDD', name: 'Malad Station', lat: 19.1866, lon: 72.8486 },
  { id: 'ST_KND', name: 'Kandivali Station', lat: 19.2045, lon: 72.8522 },
  { id: 'ST_BVI', name: 'Borivali Station', lat: 19.2294, lon: 72.8567 },

  // Central Railway
  { id: 'ST_CSMT', name: 'CSMT Station', lat: 18.9400, lon: 72.8354 },
  { id: 'ST_BY', name: 'Byculla Station', lat: 18.9774, lon: 72.8331 },
  { id: 'ST_DDR_CR', name: 'Dadar Station (CR)', lat: 19.0182, lon: 72.8438 },
  { id: 'ST_MTN', name: 'Matunga Station (CR)', lat: 19.0270, lon: 72.8540 },
  { id: 'ST_SIN', name: 'Sion Station', lat: 19.0390, lon: 72.8617 },
  { id: 'ST_CLA', name: 'Kurla Station', lat: 19.0657, lon: 72.8794 },
  { id: 'ST_GC', name: 'Ghatkopar Station', lat: 19.0864, lon: 72.9081 },
  { id: 'ST_VK', name: 'Vikhroli Station', lat: 19.1111, lon: 72.9287 },
  { id: 'ST_KJMG', name: 'Kanjurmarg Station', lat: 19.1294, lon: 72.9372 },
  { id: 'ST_BND', name: 'Bhandup Station', lat: 19.1437, lon: 72.9379 },
  { id: 'ST_TNA', name: 'Thane Station', lat: 19.1860, lon: 72.9757 },

  // Harbour Line
  { id: 'ST_VDLR', name: 'Vadala Road Station', lat: 19.0163, lon: 72.8587 },
  { id: 'ST_GTBN', name: 'GTB Nagar Station', lat: 19.0336, lon: 72.8647 },
  { id: 'ST_CMBR', name: 'Chembur Station', lat: 19.0624, lon: 72.9029 },

  // Metro Line 1
  { id: 'ST_M1_VER', name: 'Versova Metro', lat: 19.1315, lon: 72.8166 },
  { id: 'ST_M1_DN', name: 'DN Nagar Metro', lat: 19.1306, lon: 72.8344 },
  { id: 'ST_M1_AZD', name: 'Azad Nagar Metro', lat: 19.1287, lon: 72.8407 },
  { id: 'ST_M1_ADH', name: 'Andheri Metro Station', lat: 19.1200, lon: 72.8475 },
  { id: 'ST_M1_WEH', name: 'WEH Metro Station', lat: 19.1158, lon: 72.8569 },
  { id: 'ST_M1_CHK', name: 'Chakala (JB Nagar) Metro', lat: 19.1115, lon: 72.8661 },
  { id: 'ST_M1_ARP', name: 'Airport Road Metro', lat: 19.1085, lon: 72.8749 },
  { id: 'ST_M1_MRL', name: 'Marol Naka Metro', lat: 19.1082, lon: 72.8809 },
  { id: 'ST_M1_SAK', name: 'Saki Naka Metro', lat: 19.1037, lon: 72.8878 },
  { id: 'ST_M1_GHK', name: 'Ghatkopar Metro Station', lat: 19.0860, lon: 72.9088 },

  // Metro Line 2A & 7
  { id: 'ST_M2A_DH', name: 'Dahisar East Metro', lat: 19.2568, lon: 72.8601 },
  { id: 'ST_M2A_KND', name: 'Kandivali West Metro', lat: 19.2065, lon: 72.8385 },
  { id: 'ST_M2A_ADH', name: 'Andheri West Metro', lat: 19.1306, lon: 72.8344 },
  { id: 'ST_M7_GUND', name: 'Gundavali Metro (Andheri East)', lat: 19.1165, lon: 72.8575 },

  // Metro Line 3
  { id: 'ST_M3_AAR', name: 'Aarey JVLR Metro', lat: 19.1412, lon: 72.8752 },
  { id: 'ST_M3_SPZ', name: 'SEEPZ Metro', lat: 19.1228, lon: 72.8744 },
  { id: 'ST_M3_BKC', name: 'BKC Metro Station', lat: 19.0645, lon: 72.8680 },

  // Colleges and Feeder Bus Stops
  { id: 'ST_IIT_MAIN', name: 'IIT Bombay Main Gate (Powai)', lat: 19.1334, lon: 72.9133 },
  { id: 'ST_IIT_LAKE', name: 'IIT Lake Gate / Hiranandani', lat: 19.1285, lon: 72.9180 },
  { id: 'ST_POWAI_PLZ', name: 'Powai Plaza', lat: 19.1189, lon: 72.9084 },
  { id: 'ST_VJTI', name: 'VJTI College Gate (Matunga)', lat: 19.0223, lon: 72.8561 },
  { id: 'ST_RUIA', name: 'Ruia & Podar College (Matunga)', lat: 19.0238, lon: 72.8524 },
  { id: 'ST_NMIMS', name: 'NMIMS / Mithibai College (Vile Parle W)', lat: 19.1025, lon: 72.8375 },
  { id: 'ST_DJSCE', name: 'DJ Sanghvi Engg College (Vile Parle W)', lat: 19.1077, lon: 72.8371 },
  { id: 'ST_SPIT', name: 'SPIT / Bhavan Campus (Andheri W)', lat: 19.1232, lon: 72.8361 },
  { id: 'ST_HR_KC', name: 'HR / KC College (Churchgate)', lat: 18.9310, lon: 72.8275 },
  { id: 'ST_XAV', name: 'St. Xavier College (Fort)', lat: 18.9430, lon: 72.8315 },
  { id: 'ST_AGARKAR', name: 'Agarkar Chowk Bus Terminus (Andheri E)', lat: 19.1205, lon: 72.8485 }
];

let stopsCsv = 'stop_id,stop_name,stop_lat,stop_lon,location_type\n';
stops.forEach(s => {
  stopsCsv += `${s.id},"${s.name}",${s.lat},${s.lon},0\n`;
});
fs.writeFileSync(path.join(gtfsDir, 'stops.txt'), stopsCsv.trim());

// 4. calendar.txt & calendar_dates.txt
const calendarData = `service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date
DAILY,1,1,1,1,1,1,1,20260101,20261231
`;
fs.writeFileSync(path.join(gtfsDir, 'calendar.txt'), calendarData.trim());

const calendarDatesData = `service_id,date,exception_type
DAILY,20260906,1
`;
fs.writeFileSync(path.join(gtfsDir, 'calendar_dates.txt'), calendarDatesData.trim());

// 5. trips.txt and stop_times.txt
// We'll generate realistic sequences of trips across the day
const routeSequences = {
  WR_SLOW: ['ST_CCG', 'ST_MEL', 'ST_MMCT', 'ST_DDR_WR', 'ST_BA', 'ST_VLP', 'ST_ADH_WR', 'ST_JOS', 'ST_GMN', 'ST_MDD', 'ST_KND', 'ST_BVI'],
  WR_FAST: ['ST_CCG', 'ST_MMCT', 'ST_DDR_WR', 'ST_BA', 'ST_ADH_WR', 'ST_BVI'],
  CR_SLOW: ['ST_CSMT', 'ST_BY', 'ST_DDR_CR', 'ST_MTN', 'ST_SIN', 'ST_CLA', 'ST_GC', 'ST_VK', 'ST_KJMG', 'ST_BND', 'ST_TNA'],
  CR_FAST: ['ST_CSMT', 'ST_BY', 'ST_DDR_CR', 'ST_CLA', 'ST_GC', 'ST_TNA'],
  HR_MAIN: ['ST_CSMT', 'ST_VDLR', 'ST_GTBN', 'ST_CLA', 'ST_CMBR'],
  METRO_1: ['ST_M1_VER', 'ST_M1_DN', 'ST_M1_AZD', 'ST_M1_ADH', 'ST_M1_WEH', 'ST_M1_CHK', 'ST_M1_ARP', 'ST_M1_MRL', 'ST_M1_SAK', 'ST_M1_GHK'],
  METRO_2A: ['ST_M2A_DH', 'ST_M2A_KND', 'ST_M2A_ADH'],
  METRO_7: ['ST_M2A_DH', 'ST_M7_GUND'],
  METRO_3: ['ST_M3_AAR', 'ST_M3_SPZ', 'ST_M3_BKC'],
  BEST_418: ['ST_AGARKAR', 'ST_M1_WEH', 'ST_M1_CHK', 'ST_M1_MRL', 'ST_M1_SAK', 'ST_POWAI_PLZ', 'ST_IIT_MAIN'],
  BEST_492: ['ST_TNA', 'ST_BND', 'ST_KJMG', 'ST_IIT_LAKE', 'ST_IIT_MAIN', 'ST_POWAI_PLZ', 'ST_M3_SPZ'],
  BEST_203: ['ST_BVI', 'ST_KND', 'ST_MDD', 'ST_GMN', 'ST_JOS', 'ST_ADH_WR', 'ST_SPIT', 'ST_NMIMS'],
  BEST_60: ['ST_MTN', 'ST_RUIA', 'ST_VJTI', 'ST_VDLR'],
  BEST_138: ['ST_CCG', 'ST_HR_KC', 'ST_MEL', 'ST_XAV', 'ST_CSMT'],
  BEST_AS422: ['ST_AGARKAR', 'ST_M1_SAK', 'ST_POWAI_PLZ', 'ST_IIT_MAIN']
};

let tripsCsv = 'route_id,service_id,trip_id,trip_headsign,direction_id\n';
let stopTimesCsv = 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n';

function padZero(num) {
  return num < 10 ? '0' + num : '' + num;
}

function formatTime(minutesTotal) {
  const h = Math.floor(minutesTotal / 60) % 24;
  const m = Math.floor(minutesTotal % 60);
  const s = 0;
  return `${padZero(h)}:${padZero(m)}:${padZero(s)}`;
}

let tripCounter = 1000;

// Generate trips between 06:00 (360 min) and 23:00 (1380 min)
Object.entries(routeSequences).forEach(([routeId, stopList]) => {
  // Headway depends on transit type
  const isMetro = routeId.startsWith('METRO');
  const isTrain = routeId.startsWith('WR') || routeId.startsWith('CR') || routeId.startsWith('HR');
  const headway = isMetro ? 8 : (isTrain ? 10 : 15);
  const stopTravelTime = isMetro ? 3 : (isTrain ? 4 : 5);

  // Forward trips
  for (let startMin = 360; startMin <= 1380; startMin += headway) {
    const tripId = `TRIP_${routeId}_FWD_${tripCounter++}`;
    const headsign = stops.find(s => s.id === stopList[stopList.length - 1]).name;
    tripsCsv += `${routeId},DAILY,${tripId},"${headsign}",0\n`;

    let currentMin = startMin;
    stopList.forEach((stopId, seq) => {
      const timeStr = formatTime(currentMin);
      stopTimesCsv += `${tripId},${timeStr},${timeStr},${stopId},${seq + 1}\n`;
      currentMin += stopTravelTime;
    });
  }

  // Reverse trips
  const revList = [...stopList].reverse();
  for (let startMin = 365; startMin <= 1385; startMin += headway) {
    const tripId = `TRIP_${routeId}_REV_${tripCounter++}`;
    const headsign = stops.find(s => s.id === revList[revList.length - 1]).name;
    tripsCsv += `${routeId},DAILY,${tripId},"${headsign}",1\n`;

    let currentMin = startMin;
    revList.forEach((stopId, seq) => {
      const timeStr = formatTime(currentMin);
      stopTimesCsv += `${tripId},${timeStr},${timeStr},${stopId},${seq + 1}\n`;
      currentMin += stopTravelTime;
    });
  }
});

fs.writeFileSync(path.join(gtfsDir, 'trips.txt'), tripsCsv.trim());
fs.writeFileSync(path.join(gtfsDir, 'stop_times.txt'), stopTimesCsv.trim());

console.log('GTFS data generated successfully in data/gtfs!');
