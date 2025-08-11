const express = require("express");
const multer = require("multer");
const router = express.Router();
// const responseModel = require("../models/ResponseModel");
// const { logger } = require("../jobLogger");
// const { commonMessages } = require("../constants");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads"); // Save to 'uploads' folder
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({ storage });

// Route to upload image
router.post("/upload", upload.any(), (req, res) => {
  try {
    // Check if any files were uploaded
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Create URLs for all uploaded files
    const fileInfos = req.files.map((file) => `/uploads/${file.filename}`);

    res.status(200).json({
      success: true,
      message: "File(s) uploaded successfully!",
      files: fileInfos,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
