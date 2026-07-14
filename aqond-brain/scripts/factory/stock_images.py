"""
Stock Images Fallback — Unsplash/Pexels professional office photos
ถ้า Grok Video ล้มเหลว → ใช้ภาพจริงของคนทำงาน + Ken Burns effect
"""

STOCK_IMAGE_URLS = [
    # Professional office scenes with humans
    "https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=1920&h=1080&fit=crop&q=85",  # Team meeting
    "https://images.unsplash.com/photo-1556761175-b413da4baf72?w=1920&h=1080&fit=crop&q=85",  # Modern workspace
    "https://images.unsplash.com/photo-1573164713714-d95e436ab8d6?w=1920&h=1080&fit=crop&q=85",  # Young professional
    "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1920&h=1080&fit=crop&q=85",  # Entrepreneur laptop
    "https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=1920&h=1080&fit=crop&q=85",  # Business team
    "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=1920&h=1080&fit=crop&q=85",  # Office collaboration
    "https://images.unsplash.com/photo-1552581234-26160f608093?w=1920&h=1080&fit=crop&q=85",  # Business presentation
    "https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=1920&h=1080&fit=crop&q=85",  # Tech startup
]


def get_stock_image_url(scene_index: int) -> str:
    """คืน stock image URL ตาม scene index (rotate)"""
    return STOCK_IMAGE_URLS[scene_index % len(STOCK_IMAGE_URLS)]


def download_stock_image(url: str, output_path: str, timeout: int = 15) -> bool:
    """ดาวน์โหลดภาพจาก Unsplash"""
    try:
        from urllib.request import urlopen
        from pathlib import Path
        
        with urlopen(url, timeout=timeout) as resp:
            img_bytes = resp.read()
        
        if len(img_bytes) < 10000:  # < 10 KB
            return False
        
        Path(output_path).write_bytes(img_bytes)
        return True
    
    except Exception:
        return False
