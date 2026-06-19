import { Request, Response, NextFunction } from 'express';

// Maximum length constraints
const MAX_STANDARD_STRING = 2000;
const MAX_LARGE_STRING = 10 * 1024 * 1024; // 10MB (e.g. base64 images, files)

// Fields allowed to have large text payload
const LARGE_PAYLOAD_FIELDS = new Set(['avatar', 'attachments', 'description', 'note', 'code', 'token', 'inviteToken', 'stages', 'kanbanStages', 'checklist']);

function checkPayloadDepth(obj: any, currentDepth = 1): boolean {
  if (currentDepth > 5) return false;
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (!checkPayloadDepth(obj[key], currentDepth + 1)) {
        return false;
      }
    }
  }
  return true;
}

function sanitizeValue(value: any, keyName?: string): any {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const isLargeField = keyName && LARGE_PAYLOAD_FIELDS.has(keyName);
    const limit = isLargeField ? MAX_LARGE_STRING : MAX_STANDARD_STRING;

    if (trimmed.length > limit) {
      throw new Error(`Field '${keyName || 'input'}' exceeds maximum length of ${limit} characters.`);
    }

    // Sanitize string to prevent script injections
    let sanitized = trimmed;
    
    // Check if it's base64 (which should not be HTML escaped as it would corrupt the binary data)
    const isBase64 = trimmed.startsWith('data:') && trimmed.includes(';base64,');

    if (!isBase64) {
      sanitized = sanitized
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Strip script blocks
        .replace(/on\w+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]*)/gi, '') // Strip onload/onclick event attributes
        .replace(/javascript\s*:\s*[^\s"']*/gi, '') // Strip javascript: URIs
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
    
    return sanitized;
  }

  if (Array.isArray(value)) {
    return value.map(item => sanitizeValue(item, keyName));
  }

  if (value && typeof value === 'object') {
    const sanitizedObj: any = {};
    for (const [key, val] of Object.entries(value)) {
      // Prevent prototype pollution
      if (key === '__proto__' || key === 'constructor') continue;
      // Prevent NoSQL Injection: omit keys starting with '$' or containing '.'
      if (key.startsWith('$') || key.includes('.')) continue;
      sanitizedObj[key] = sanitizeValue(val, key);
    }
    return sanitizedObj;
  }

  return value;
}

export const sanitizeMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Check request payload structural integrity and nesting depth
    if (req.body && !checkPayloadDepth(req.body)) {
      return res.status(400).json({ message: 'Malformed request: payload depth exceeds limit.' });
    }
    if (req.query && !checkPayloadDepth(req.query)) {
      return res.status(400).json({ message: 'Malformed request: query depth exceeds limit.' });
    }

    // 2. Sanitize and validate request parameters, body, and query string
    if (req.body) {
      req.body = sanitizeValue(req.body);
    }
    if (req.query) {
      const sanitizedQuery = sanitizeValue(req.query);
      for (const key of Object.keys(req.query)) {
        delete req.query[key];
      }
      Object.assign(req.query, sanitizedQuery);
    }
    if (req.params) {
      const sanitizedParams = sanitizeValue(req.params);
      for (const key of Object.keys(req.params)) {
        delete req.params[key];
      }
      Object.assign(req.params, sanitizedParams);
    }

    next();
  } catch (err: any) {
    return res.status(400).json({ message: err.message || 'Invalid or malformed request payload.' });
  }
};
