const express = require("express");
const { registerByGoogle, register, login, forgetPasswordRequest, verifyCode, resetPassword, verifiedUser, updatePassword } = require("../controllers/authController");
const { protect } = require("../middleweres/protect");

const router = express.Router();

router.post("/google", registerByGoogle);
router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password/request", forgetPasswordRequest);
router.post("/forgot-password/verify", verifyCode);
router.post("/forgot-password/reset", resetPassword);
router.get("/me", protect, verifiedUser);
router.put("/password", protect, updatePassword);

module.exports = router; 