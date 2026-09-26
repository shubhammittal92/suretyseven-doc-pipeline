import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { config } from '../config';
import { DocumentStatus } from '../types';
import * as docService from '../services/documentService';
import * as repo from '../db/repository';
import { ApiError } from '../middleware/errorHandler';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes },
});

export const router = Router();

const asyncH =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

const ALLOWED_MIME = new Set(['application/pdf']);

// POST /documents  -- upload a document (multipart/form-data: file, documentType, metadata?)
router.post(
  '/documents',
  upload.single('file'),
  asyncH(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'FILE_REQUIRED', 'A file is required.');
    const documentType = (req.body.documentType || '').trim();
    if (!documentType) {
      throw new ApiError(400, 'DOCUMENT_TYPE_REQUIRED', 'documentType is required.');
    }
    // Support at least PDF.
    if (!ALLOWED_MIME.has(req.file.mimetype)) {
      throw new ApiError(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Only PDF documents are supported.'
      );
    }

    let metadata: Record<string, unknown> | null = null;
    if (req.body.metadata) {
      try {
        metadata = JSON.parse(req.body.metadata);
      } catch {
        throw new ApiError(400, 'INVALID_METADATA', 'metadata must be valid JSON.');
      }
    }

    const { document, duplicate } = await docService.upload({
      filename: req.file.originalname,
      documentType,
      buffer: req.file.buffer,
      metadata,
    });

    res.status(duplicate ? 200 : 201).json({
      documentId: document.id,
      status: document.status,
      duplicate,
    });
  })
);

// GET /documents  -- list with filters + pagination
router.get(
  '/documents',
  asyncH(async (req, res) => {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.pageSize || '20'), 10) || 20)
    );
    const status = req.query.status
      ? (String(req.query.status).toUpperCase() as DocumentStatus)
      : undefined;
    if (status && !Object.values(DocumentStatus).includes(status)) {
      throw new ApiError(400, 'INVALID_STATUS', 'Unknown status filter.');
    }
    const documentType = req.query.documentType ? String(req.query.documentType) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;

    const { items, total } = await repo.listDocuments({
      status,
      documentType,
      search,
      page,
      pageSize,
    });

    res.json({
      items: items.map(docService.toApi),
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    });
  })
);

// GET /documents/stats  -- dashboard counts (bonus). Declared before :id route.
router.get(
  '/documents/stats',
  asyncH(async (_req, res) => {
    res.json(await repo.statusCounts());
  })
);

// GET /documents/:id  -- single document with result / validation errors
router.get(
  '/documents/:id',
  asyncH(async (req, res) => {
    const doc = await repo.getById(req.params.id);
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
    res.json(docService.toApi(doc));
  })
);

// GET /documents/:id/history  -- processing lifecycle
router.get(
  '/documents/:id/history',
  asyncH(async (req, res) => {
    const doc = await repo.getById(req.params.id);
    if (!doc) throw new ApiError(404, 'NOT_FOUND', 'Document not found.');
    const history = await repo.getHistory(req.params.id);
    res.json(
      history.map((h) => ({
        status: h.status,
        attempt: h.attempt,
        reason: h.reason,
        timestamp: h.created_at,
      }))
    );
  })
);
