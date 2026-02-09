const express = require('express');
const router = express.Router();
const { getUserMarkedLocations, createPersonalLocation, updatePersonalLocation, deletePersonalLocation, clearAllPersonalLocations } = require('../controllers/userMarkedLocationsController');
const { protect } = require('../middleweres/protect');


// GET /api/user/marked-locations - Get user's current marked locations
router.get('/', protect, getUserMarkedLocations);

// POST /api/user/marked-locations - Create personal marked location
router.post('/', protect, createPersonalLocation);

// PUT /api/user/marked-locations/:locationId - Update personal marked location
router.put('/:locationId', protect, updatePersonalLocation);

// DELETE /api/user/marked-locations/:locationId - Delete personal marked location
router.delete('/:locationId', protect, deletePersonalLocation);

// DELETE /api/user-marked-locations - Clear all personal marked locations
router.delete('/', protect, clearAllPersonalLocations);

module.exports = router;
