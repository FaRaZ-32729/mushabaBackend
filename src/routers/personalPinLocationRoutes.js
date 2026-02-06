const express = require('express');
const router = express.Router();
const { createPersonalPinLocation, getPersonalPinLocations, getPersonalPinLocationsForChat, getPersonalPinLocation, updatePersonalPinLocation, deletePersonalPinLocation } = require('../controllers/personalPinLocationController');
const uploadForPersonalPin = require('../utils/uploadForPersonalPinLocation');
const { protect } = require('../middleweres/protect');

router.use(protect);

// Create a new personal pin location
router.post('/', uploadForPersonalPin.array('images', 2), createPersonalPinLocation);

// Get user's personal pin locations
router.get('/me', getPersonalPinLocations);

// Get user's personal pin locations for specific chat
router.get('/chat/:chatId', getPersonalPinLocationsForChat);

// Get a specific personal pin location
router.get('/:pinId', getPersonalPinLocation);

// Update a personal pin location (supports partial updates)
router.put('/:pinId', (req, res, next) => {
    console.log('[PERSONAL_PIN_ROUTE_DEBUG] PUT request received for pinId:', req.params.pinId);
    console.log('[PERSONAL_PIN_ROUTE_DEBUG] Files in request:', req.files?.length || 0);
    console.log('[PERSONAL_PIN_ROUTE_DEBUG] Multer limits:', upload.limits);
    next();
}, uploadForPersonalPin.array('images', 2), updatePersonalPinLocation);

// Delete a personal pin location
router.delete('/:pinId', deletePersonalPinLocation);

module.exports = router;
