import { productEmoji } from '@/lib/productVisual';

type Props = {
  category?: string;
  title?: string;
  imageUrl?: string;
  className?: string;
};

/** Square product visual — emoji placeholder or image (same look as product cards). */
export function TtProductThumb({ category, title, imageUrl, className = 'tt-cart-thumb' }: Props) {
  const emoji = productEmoji(category, title);
  return (
    <div className={className} aria-hidden>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt="" className="tt-cart-thumb-img" />
      ) : (
        <span className="tt-cart-thumb-emoji">{emoji}</span>
      )}
    </div>
  );
}
