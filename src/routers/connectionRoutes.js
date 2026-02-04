const express = require('express');
const { getUserWithTime, getCurrnetUserConnections, addConnection, removeUserConnection, transferOwnership, getActivityLogs, handleConnectionRequest, updateConnectionStatus, removeConnection, leaveConnection, removeUser, getConnection, getSingleConnection, getAllConnections, createConnection } = require('../controllers/connectionController');
const { protect } = require('../middleweres/protect');

const router = express.Router();

// All routes require authentication
router.use(protect);

// Create a new connection or add member to existing connection
router.post('/', createConnection);

// Get all connections for current user
router.get('/', getAllConnections);

// Get a single connection by ID
router.get('/:connectionId', getSingleConnection);

// Remove a user from connection
router.post('/:connectionId/remove', removeUser);

// Leave a connection
router.post('/:connectionId/leave', leaveConnection);

// Remove a connection
router.delete('/:connectionId', removeConnection);

// Update connection status
router.patch('/:connectionId/status', updateConnectionStatus);

// Handle connection request
router.post('/requests/:requestId', handleConnectionRequest);

// Get activity logs for a connection
router.get('/:connectionId/logs', getActivityLogs);

// Get connection users with timestamps (for real-time updates)
router.get('/:connectionId/users', getUserWithTime);

// Get user connections
router.get('/', getCurrnetUserConnections);

// Add connection
router.post('/:userId', addConnection);

// Remove connection
router.delete('/:userId', removeUserConnection);

// Transfer ownership
router.post('/:connectionId/transfer-ownership', transferOwnership);

module.exports = router; 