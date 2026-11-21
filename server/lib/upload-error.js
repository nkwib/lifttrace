// A refused or oversized file is the caller's mistake, not the server falling
// over, so it answers 413 or 400 instead of reaching the error handler as a 500.
export function uploadError(err, next, maxMb) {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return next(Object.assign(new Error(`That file is larger than this server accepts (${maxMb} MB).`), { status: 413 }));
  }
  if (err?.name === 'MulterError' && !err.status) err.status = 400;
  return next(err);
}

// upload.single(field) as middleware whose multer errors go through uploadError.
export function singleUpload(upload, field, maxMb) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => (err ? uploadError(err, next, maxMb) : next()));
  };
}
