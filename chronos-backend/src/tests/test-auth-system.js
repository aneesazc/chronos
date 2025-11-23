require('dotenv').config();
const AuthService = require('../services/authService');
const { User } = require('../models');
const { testConnection: testDbConnection } = require('../config/database');
const { testConnection: testRedisConnection } = require('../config/redis');
const logger = require('../config/logger');

/**
 * Test authentication system
 */
async function testAuthSystem() {
    console.log('\n=== Testing Authentication System ===\n');

    try {
        // Test 1: Database Connection
        console.log('1. Testing Database Connection');
        const dbConnected = await testDbConnection();
        if (!dbConnected) {
            throw new Error('Database connection failed');
        }
        console.log('   ✅ Database connected\n');

        // Test 2: Redis Connection
        console.log('2. Testing Redis Connection');
        const redisConnected = await testRedisConnection();
        if (!redisConnected) {
            throw new Error('Redis connection failed');
        }
        console.log('   ✅ Redis connected\n');

        // Test 3: User Registration
        console.log('3. Testing User Registration');
        const testEmail = `test-${Date.now()}@example.com`;
        const testPassword = 'TestPassword123!';

        const registerResult = await AuthService.register({
            email: testEmail,
            password: testPassword,
        });

        console.log('   ✅ User registered successfully');
        console.log('   User ID:', registerResult.user.id);
        console.log('   Email:', registerResult.user.email);
        console.log('   Token:', registerResult.token.substring(0, 20) + '...');
        console.log('   Expires in:', registerResult.expires_in, 'seconds\n');

        // Test 4: Token Verification
        console.log('4. Testing Token Verification');
        const decoded = AuthService.verifyToken(registerResult.token);
        console.log('   ✅ Token verified successfully');
        console.log('   User ID from token:', decoded.user_id);
        console.log('   Email from token:', decoded.email, '\n');

        // Test 5: User Login
        console.log('5. Testing User Login');
        const loginResult = await AuthService.login({
            email: testEmail,
            password: testPassword,
        });

        console.log('   ✅ Login successful');
        console.log('   User ID:', loginResult.user.id);
        console.log('   Token:', loginResult.token.substring(0, 20) + '...\n');

        // Test 6: Invalid Login
        console.log('6. Testing Invalid Login');
        try {
            await AuthService.login({
                email: testEmail,
                password: 'WrongPassword123!',
            });
            console.log('   ❌ Should have failed');
        } catch (error) {
            console.log('   ✅ Invalid login rejected:', error.message, '\n');
        }

        // Test 7: Password Validation
        console.log('7. Testing Password Validation');

        const weakPassword = AuthService.validatePassword('weak');
        console.log('   Weak password ("weak"):');
        console.log('     Valid:', weakPassword.valid);
        console.log('     Strength:', weakPassword.strength);
        console.log('     Errors:', weakPassword.errors.length);

        const strongPassword = AuthService.validatePassword('StrongPass123!@#');
        console.log('   Strong password ("StrongPass123!@#"):');
        console.log('     Valid:', strongPassword.valid);
        console.log('     Strength:', strongPassword.strength);
        console.log('     Errors:', strongPassword.errors.length, '\n');

        // Test 8: Token Refresh
        console.log('8. Testing Token Refresh');
        const refreshResult = await AuthService.refreshToken(loginResult.token);
        console.log('   ✅ Token refreshed successfully');
        console.log('   New token:', refreshResult.token.substring(0, 20) + '...\n');

        // Test 9: Get User From Token
        console.log('9. Testing Get User From Token');
        const userFromToken = await AuthService.getUserFromToken(refreshResult.token);
        console.log('   ✅ User retrieved from token');
        console.log('   User ID:', userFromToken.id);
        console.log('   Email:', userFromToken.email, '\n');

        // Test 10: Invalid Token
        console.log('10. Testing Invalid Token');
        try {
            AuthService.verifyToken('invalid.token.here');
            console.log('   ❌ Should have failed');
        } catch (error) {
            console.log('   ✅ Invalid token rejected:', error.message, '\n');
        }

        // Cleanup
        console.log('11. Cleaning up test data');
        await User.delete(registerResult.user.id);
        console.log('   ✅ Test user deleted\n');

        console.log('=== All Authentication Tests Passed! ✅ ===\n');
        console.log('Authentication system is working correctly!');
        console.log('You can now start the server with: npm run dev\n');

        process.exit(0);
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Error details:', error);
        process.exit(1);
    }
}

// Run tests
testAuthSystem();