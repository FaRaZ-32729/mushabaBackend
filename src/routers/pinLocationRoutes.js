const express = require('express');
const router = express.Router();
const { createPinLocation, getPinLocations, getPinLocation, updatePinLocation, deletePinLocation, getUserPinLocations, getPinLocationStats, cleanupExpiredPins } = require('../controllers/pinLocationController');
const uploadForPinLocation = require('../utils/uploadForPinLocation');
const { protect } = require('../middleweres/protect');

// Create a new pin location
router.post('/', protect, uploadForPinLocation.array('images', 2), createPinLocation);

// Get all active pin locations for a connection
router.get('/connection/:connectionId', protect, getPinLocations);

// Get a specific pin location
router.get('/:pinId', protect, getPinLocation);

// Update a pin location (supports partial updates)
router.put('/:pinId', protect, (req, res, next) => {
  console.log('[PIN_ROUTE_DEBUG] PUT request received for pinId:', req.params.pinId);
  console.log('[PIN_ROUTE_DEBUG] Files in request:', req.files?.length || 0);
  console.log('[PIN_ROUTE_DEBUG] Multer limits:', upload.limits);
  next();
}, uploadForPinLocation.array('images', 2), updatePinLocation);

// Delete a pin location
router.delete('/:pinId', protect, deletePinLocation);

// Get user's active pin locations
router.get('/user/me', protect, getUserPinLocations);

// Get pin location statistics for a connection
router.get('/stats/:connectionId', protect, getPinLocationStats);

// Cleanup expired pin locations (admin/maintenance)
router.delete('/cleanup/expired', protect, cleanupExpiredPins);

module.exports = router;
