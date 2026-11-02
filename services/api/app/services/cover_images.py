"""Validate raster uploads, strip metadata and preserve immutable cover assets."""
import hashlib
import warnings
from io import BytesIO
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi import HTTPException
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from app.models.notebook import CoverImage

MAX_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 20_000_000

def normalize(data: bytes, size: int = 3840) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as source:
                if source.format not in {'JPEG', 'PNG', 'WEBP', 'GIF'}:
                    raise HTTPException(415, 'Use a JPEG, PNG, WebP or GIF image.')
                if source.width * source.height > MAX_PIXELS:
                    raise HTTPException(413, 'Choose an image smaller than 20 megapixels.')
                source.verify()
            with Image.open(BytesIO(data)) as source:
                # Animated images use their first frame. Normalize orientation and remove metadata.
                image = ImageOps.exif_transpose(source).convert('RGBA')
                image.thumbnail((size, size))
                output = BytesIO()
                image.save(output, format='WEBP', quality=88, method=4)
                result = output.getvalue()
                if len(result) > MAX_BYTES:
                    raise HTTPException(413, 'Choose a smaller image.')
                return result
    except HTTPException:
        raise
    except (Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(413, 'Choose an image smaller than 20 megapixels.')
    except (UnidentifiedImageError, OSError, ValueError, SyntaxError):
        raise HTTPException(415, 'This image could not be opened. Use a valid JPEG, PNG, WebP or GIF file.')

def save(session: Session, data: bytes) -> str:
    key = hashlib.sha256(data).hexdigest()
    session.execute(insert(CoverImage).values(id=key, data=data).on_conflict_do_nothing(index_elements=['id']))
    return f'/api/notebook/cover-images/{key}.webp'
