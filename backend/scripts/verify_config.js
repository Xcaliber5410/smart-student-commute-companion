const assert = require('assert');
const config = require('../config');
const { validateEnv } = require('../config');

console.log('====================================================');
console.log(' Running Centralized Config Verification Suite');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`✅ PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   Error: ${err.message}`);
    failed++;
  }
}

// TEST 1: Default valid configuration loads properly
runTest('Default valid configuration loads successfully with safe defaults', () => {
  assert(typeof config.port === 'number', 'PORT should be a number');
  assert(config.port >= 1 && config.port <= 65535, 'PORT should be in valid range');
  assert(['development', 'production', 'test'].includes(config.nodeEnv), 'NODE_ENV should be valid');
  assert(typeof config.clientUrl === 'string' && config.clientUrl.startsWith('http'), 'CLIENT_URL should be valid');
  assert(Array.isArray(config.allowedOrigins), 'allowedOrigins should be an array');
  assert(config.allowedOrigins.includes(config.clientUrl), 'allowedOrigins should include clientUrl');
  assert(typeof config.database.path === 'string', 'database.path should be defined');
});

// TEST 2: Sanitized output never reveals raw API keys
runTest('Sanitized config output redacts secrets', () => {
  const sanitized = config.toSanitizedObject();
  assert(sanitized.port === config.port, 'Port is preserved in sanitized view');
  assert(sanitized.clientUrl === config.clientUrl, 'Client URL is preserved in sanitized view');
  if (config.geminiApiKey) {
    assert(!sanitized.geminiApiKey.includes(config.geminiApiKey), 'Raw secret must not appear in sanitized output');
    assert(sanitized.geminiApiKey.startsWith('***'), 'Secret should be masked with asterisks');
  } else {
    assert(sanitized.geminiApiKey.includes('not configured'), 'Shows friendly message when not set');
  }
});

// TEST 3: Validation catches invalid PORT types and ranges
runTest('Rejects invalid PORT values with sanitized error message', () => {
  let threw = false;
  try {
    validateEnv({ PORT: 'not-a-number' });
  } catch (err) {
    threw = true;
    assert(err.message.includes('[PORT]'), 'Error should identify PORT field');
    assert(err.message.includes('PORT must be a valid number'), 'Error message should be sanitized');
  }
  assert(threw, 'Should have thrown error on non-numeric PORT');

  threw = false;
  try {
    validateEnv({ PORT: '70000' });
  } catch (err) {
    threw = true;
    assert(err.message.includes('PORT must be between 1 and 65535'), 'Should reject out-of-range port');
  }
  assert(threw, 'Should have thrown error on out-of-range PORT');
});

// TEST 4: Validation catches invalid NODE_ENV
runTest('Rejects invalid NODE_ENV values with sanitized error message', () => {
  let threw = false;
  try {
    validateEnv({ NODE_ENV: 'staging_unknown' });
  } catch (err) {
    threw = true;
    assert(err.message.includes('[NODE_ENV]'), 'Error should identify NODE_ENV field');
    assert(err.message.includes('NODE_ENV must be one of'), 'Error should list valid choices');
  }
  assert(threw, 'Should have thrown error on invalid NODE_ENV');
});

// TEST 5: Validation catches invalid CLIENT_URL
runTest('Rejects invalid CLIENT_URL values with sanitized error message', () => {
  let threw = false;
  try {
    validateEnv({ CLIENT_URL: 'invalid-url-string' });
  } catch (err) {
    threw = true;
    assert(err.message.includes('[CLIENT_URL]'), 'Error should identify CLIENT_URL field');
    assert(err.message.includes('CLIENT_URL must be a valid URL'), 'Error should explain format');
  }
  assert(threw, 'Should have thrown error on invalid CLIENT_URL');
});

// TEST 6: Production environment rejects localhost CLIENT_URL
runTest('Enforces non-localhost CLIENT_URL in production', () => {
  let threw = false;
  try {
    validateEnv({
      NODE_ENV: 'production',
      CLIENT_URL: 'http://localhost:5173'
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes('CLIENT_URL must not point to localhost'), 'Should reject localhost in production');
  }
  assert(threw, 'Production must reject localhost URL');

  // Valid production URL should succeed
  const prodValid = validateEnv({
    NODE_ENV: 'production',
    CLIENT_URL: 'https://commute.studentapp.org'
  });
  assert(prodValid.NODE_ENV === 'production', 'Production valid config accepted');
  assert(prodValid.CLIENT_URL === 'https://commute.studentapp.org', 'Production URL preserved');
});

// TEST 7: Enforcing GEMINI_API_KEY when REQUIRE_GEMINI_KEY is true
runTest('Fails when REQUIRE_GEMINI_KEY is true but GEMINI_API_KEY is missing or empty', () => {
  let threw = false;
  try {
    validateEnv({
      REQUIRE_GEMINI_KEY: 'true',
      GEMINI_API_KEY: ''
    });
  } catch (err) {
    threw = true;
    assert(err.message.includes('GEMINI_API_KEY is required because REQUIRE_GEMINI_KEY is enabled'), 'Explains missing key requirement');
  }
  assert(threw, 'Should require GEMINI_API_KEY when REQUIRE_GEMINI_KEY is true');

  // Should succeed when key is provided
  const validKeyEnv = validateEnv({
    REQUIRE_GEMINI_KEY: 'true',
    GEMINI_API_KEY: 'ai-test-key-sample-12345'
  });
  assert(validKeyEnv.GEMINI_API_KEY === 'ai-test-key-sample-12345', 'Valid key accepted');
});

// TEST 8: Secrets are never exposed in error messages
runTest('Ensures secret content is never leaked in error messages', () => {
  const secretKey = 'super-secret-production-gemini-token-999';
  try {
    // Cause an unrelated validation error while secret is present in env
    validateEnv({
      PORT: 'invalid-port',
      GEMINI_API_KEY: secretKey
    });
  } catch (err) {
    assert(!err.message.includes(secretKey), 'Secret token must NOT appear in error message');
    assert(err.message.includes('[PORT]'), 'Legitimate error is reported');
  }
});

console.log('\n----------------------------------------------------');
console.log(` CONFIG VERIFICATION SUMMARY: ${passed} passed, ${failed} failed`);
console.log('----------------------------------------------------');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('ALL CONFIGURATION TESTS PASSED SUCCESSFULLY! 🎉\n');
}
