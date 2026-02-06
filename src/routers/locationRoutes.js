const express = require('express');
const { markLocation, getMarkedLocations, handleOwnershipTransfer, updateUserLocationForRTT, getMarkedLocationEnhanced, updateMarkedLocation, deleteMarkedLocation, markOfflineUser, getGroupLocations, testDB, getConnectionLocationHistory, cleanupOldLocations, getUserLocation, getMemoryStatusApi } = require('../controllers/locationController');
const { protect: auth } = require('../middleweres/protect');
const uploadForLocation = require('../utils/uploadForLocation');

const router = express.Router();

// Mark a location (bus station or hotel) - ENHANCED with personal/group support
router.post('/mark', auth, uploadForLocation.array('images', 1), markLocation);

// Mark a personal location (for members)
router.post('/mark-personal', auth, uploadForLocation.array('images', 1), markLocation);

// Get enhanced marked locations with priority logic
router.get('/enhanced/:connectionId', auth, getMarkedLocationEnhanced);

// Handle ownership transfer
router.post('/transfer-ownership', auth, handleOwnershipTransfer);

// Update user location (for real-time tracking)
router.post('/', auth, updateUserLocationForRTT);

// Get marked locations for a connection
router.get('/marked/:connectionId', auth, getMarkedLocations);

// Update a marked location
router.put('/marked/:locationId', auth, uploadForLocation.array('images', 2), updateMarkedLocation);

// Delete a marked location
router.delete('/marked/:locationId', auth, deleteMarkedLocation);

// Mark user as offline
router.post('/offline', auth, markOfflineUser);

// Get all user locations in a group connection
router.get('/group/:connectionId', auth, getGroupLocations);

// Test endpoint to check database connectivity and model
router.get('/test-db', auth, testDB);

// NEW: Get connection location history and analytics
router.get('/connection/:connectionId/history', auth, getConnectionLocationHistory);

// NEW: Clean up old location data (maintenance function)
router.delete('/cleanup', auth, cleanupOldLocations);

// Get a specific user's location
router.get('/user/:userId', auth, getUserLocation);

// NEW: Get memory status for debugging and monitoring
router.get('/memory-status', auth, getMemoryStatusApi);

module.exports = router;