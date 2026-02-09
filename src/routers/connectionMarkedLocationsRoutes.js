const express = require('express');
const router = express.Router();
const {
    getGroupMarkedLocations,
    createGroupLocation,
    updateGroupLocation,
    deleteGroupLocation,
    transferOwnership
} = require('../controllers/connectionMarkedLocationsController');
const { protect } = require('../middleweres/protect');


// GET /api/connection/:connectionId/marked-locations - Get group marked locations
router.get('/:connectionId/marked-locations', protect, getGroupMarkedLocations);

// POST /api/connection/:connectionId/marked-locations - Create group marked location
router.post('/:connectionId/marked-locations', protect, createGroupLocation);

// PUT /api/connection/:connectionId/marked-locations/:locationId - Update group marked location
router.put('/:connectionId/marked-locations/:locationId', protect, updateGroupLocation);

// DELETE /api/connection/:connectionId/marked-locations/:locationId - Delete group marked location
router.delete('/:connectionId/marked-locations/:locationId', protect, deleteGroupLocation);

// POST /api/connection/:connectionId/transfer-ownership - Transfer ownership
router.post('/:connectionId/transfer-ownership', protect, transferOwnership);

module.exports = router;