import { Image as ImageIcon, Trash2, Upload } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { api } from '../api';

interface ImageFieldProps {
  label?: string;
  value: string;
  onChange: (nextUrl: string) => void;
  placeholder?: string;
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_CLIENT_BYTES = 3 * 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Datei konnte nicht gelesen werden.'));
      }
    };
    reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

export function ImageField({
  label = 'Produktbild',
  value,
  onChange,
  placeholder = '/images/parts/... oder https://...',
}: ImageFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  async function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    setUploadError('');
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ALLOWED_TYPES.has(file.type)) {
      setUploadError('Nur JPEG, PNG oder WebP erlaubt.');
      return;
    }
    if (file.size > MAX_CLIENT_BYTES) {
      setUploadError('Die Bilddatei darf maximal 3 MB groß sein.');
      return;
    }

    setUploading(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      const commaIndex = dataUrl.indexOf(',');
      const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
      const result = await api.uploadImage(file.type, base64);
      onChange(result.imageUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Bildupload fehlgeschlagen.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="form-field full">
      <label className="form-label">{label}</label>
      <div className="image-upload-field">
        <div className="image-upload-preview">
          {value ? (
            <img src={value} alt={label} />
          ) : (
            <ImageIcon size={20} />
          )}
        </div>

        <div className="image-upload-controls">
          <div className="image-upload-actions">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden-file-input"
              onChange={(e) => void handleFileSelect(e)}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              <Upload size={14} />
              <span>{uploading ? 'Lädt hoch...' : 'Bild hochladen'}</span>
            </button>
            {value && (
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={() => onChange('')}
              >
                <Trash2 size={14} />
                <span>Entfernen</span>
              </button>
            )}
          </div>

          <input
            type="text"
            className="input mono"
            style={{ fontSize: 12.5, padding: '6px 10px' }}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
          />
          {uploadError && <div className="form-error" style={{ marginTop: 4 }}>{uploadError}</div>}
        </div>
      </div>
    </div>
  );
}
