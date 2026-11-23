To ensure you're handling and sanitizing image uploads via GraphQL (e.g., using `GraphQLUpload` in a Node.js
environment) securely, here is a bullet list of best practices:

### 1. **File Validation and Type Checking**

- **MIME Type Validation**: Ensure that the file is an actual image (e.g., check for `image/jpeg`, `image/png`, etc.).
  Do not rely solely on the file extension, as it can be spoofed.
- **File Extension Validation**: Double-check that the file has a valid extension (`.jpg`, `.png`, `.gif`, etc.).
- **Magic Number Validation**: Examine the file's first few bytes (magic numbers) to ensure that the file content
  matches the claimed MIME type.
- **Size Limits**: Limit the size of uploaded images to prevent denial-of-service attacks with large files.

### 2. **Virus and Malware Scanning**

- **Antivirus Scanning**: Use a service or library like [ClamAV](https://www.clamav.net/) or third-party services (e.g.,
  VirusTotal API) to scan the file for known viruses or malware.
- **Hash Blacklist Checking**: Compare the file's hash (e.g., MD5, SHA256) against a database of known malicious file
  hashes.

### 3. **Image Content Validation**

- **Image Re-encoding**: Re-encode the image after upload (e.g., using `Sharp`, `ImageMagick`, or similar) to ensure the
  file conforms to expected image formats and strips malicious payloads hidden in metadata or file structure.
- **Metadata Removal**: Strip all metadata (EXIF data) from the image to avoid any harmful information, including
  possible scripts embedded within the metadata.
- **Content Moderation**: Optionally, integrate content moderation tools to detect inappropriate or harmful content (
  NSFW images, etc.).

### 4. **Sanitizing File Paths and Storage**

- **Use Safe Filenames**: Sanitize the filename by removing special characters, spaces, or potential malicious scripts
  that could be embedded in the name. Consider renaming the file (e.g., UUIDs or hash-based filenames).
- **Safe Directory Storage**: Store files in secure directories with appropriate permissions. Ensure the storage
  directory is not publicly accessible without authentication.
- **Isolate Temporary Storage**: Store uploads in a temporary folder and only move them to a permanent storage after
  passing validation and security checks.

### 5. **Content Delivery Considerations**

- **Restrict Image Types in Responses**: When serving user-uploaded files, ensure that only valid image MIME types are
  sent in response headers to prevent arbitrary file downloads.
- **Rate Limiting**: Implement rate limiting on uploads to prevent abuse through too many file uploads or large files
  that could overload your server.

### 6. **Image Processing Safety**

- **Use Secure Libraries**: Use well-maintained libraries like `Sharp` or `Jimp` to resize or manipulate images, as
  opposed to directly handling binary file operations which could be unsafe.
- **Avoid Shell Commands**: Avoid invoking command-line tools like `ImageMagick` with untrusted user input, as this
  could introduce vulnerabilities (e.g., ImageTragick).

### 7. **Use HTTPS**

- **Secure Uploads via HTTPS**: Always enforce HTTPS for file uploads to prevent man-in-the-middle attacks where an
  attacker could alter the image or inject malicious content.

### 8. **Audit Logging**

- **Log Upload Activity**: Maintain logs of all file upload activities, including the user's IP address, filename, and
  timestamp, for future auditing or debugging.

By following these steps, you can significantly reduce the risk of security issues when handling image uploads.

## 3D models (GLB)

A GLB is not an image, and the list above does not cover it. A binary glTF is a JSON document plus binary data, so the
hostile cases are different: the JSON can point at files on your server or at remote URLs, a few bytes of header can
claim a texture of 100 000 by 100 000 pixels or a billion triangles, compressed geometry can claim a huge decoded size,
and `extras` and unknown extensions carry data nobody checked.

- **Check the container first**: `glTF` magic, version 2, the length in the header against the real length, one JSON
  chunk then at most one BIN chunk, and a size limit (`checkGlbContainer`).
- **Refuse every `uri`**: only the embedded GLB buffer is allowed. A relative path, an absolute path, `file:`, `http:`
  and `data:` are all rejected.
- **Allowlist the extensions**: reject the rest, `KHR_interactivity` always. No Draco, because nothing here can decode it.
- **Limit what the file declares**: triangles, vertices, accessors (sparse counts too), meshes, nodes, materials,
  textures, animations, buffer bytes, and the width and height of each texture read from its image header, before any
  decode.
- **Validate, then rewrite**: run the Khronos glTF Validator, rewrite the model through glTF Transform (drop `extras`,
  unknown extensions and unused data, decode-test and re-encode meshopt data), re-encode PNG, JPEG and WebP textures with
  `sharp`, and write a fresh GLB. Check the new file again.
- **Return a verdict, do not throw**: `sanitiseGlb` gives `accepted` or `rejected` with reasons that carry a machine
  code; only misuse throws.
- **Still scan it**: the sanitiser looks at structure, not at signatures. Run `scanVirus` on the stored file.
- **Raise the upload cap on purpose**: `storeUploadAsTemp` stops at 5 MB unless you pass a bigger `maxFileSize`.

The pieces are `validateGlbExtension`, `validateMimeTypeGlb`, `checkGlbContainer`, `sanitiseGlb` and `sanitiseGlbFile`, with
the limits in `GLB_POLICY_DEFAULTS` and the reason codes in `GLB_REJECT_CODES`. Reference: `docs/code/files.md`.
