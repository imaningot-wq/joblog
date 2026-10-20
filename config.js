// ============================================================
// Paste your Google Apps Script "Web app URL" between the quotes.
// Leave it empty ('') to run the app in DEMO mode with sample data.
// ============================================================
window.APP_CONFIG = {
  API_URL: '',
  APP_NAME: 'Facility Job Log',
  MAX_PHOTOS_PER_TYPE: 8,     // photos allowed for Attend and for Work Done
  PHOTO_MAX_SIDE: 1600,       // photos are resized to this many pixels on the long side
  PHOTO_QUALITY: 0.72,        // JPEG quality 0–1 (lower = smaller upload)
  REQUIRE_PHOTO: true         // at least 1 photo for each type selected
};
