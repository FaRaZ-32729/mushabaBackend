const express = require("express");
const { protect } = require("../middleweres/protect");
const { getQRUsers, getCurrentUserData, createQRUser, updateQRUser, deleteQRUser, updateCurrentUserQR } = require("../controllers/qrUsersController");
const router = express.Router();

// QR Users routes - inline to avoid import issues
router.get('/', protect, getQRUsers);
router.get('/current-user-data', protect, getCurrentUserData);
router.post('/', protect, createQRUser);
router.put('/:qrUserId', protect, updateQRUser);
router.delete('/:qrUserId', protect, deleteQRUser);
router.put('/current-user/update', protect, updateCurrentUserQR);

module.exports = router;
