import SmartImage from '@/components/SmartImage';
import { absUrl } from '@/components/camp/campNormalize';

type Props = {
    src?: string | null;
    size?: number;            // px
    alt?: string;
    className?: string;
};

export default function Avatar({ src, size = 120, alt = 'Аватар', className = '' }: Props) {
    const fallback = '/avatars/question3.jpg'; // положи иконку в /public/avatars/question.svg
    const finalSrc = (absUrl(src || '') || src || fallback);

    return (
        <SmartImage
            src={finalSrc}
            alt={alt}
            width={size}
            height={size}
            sizes={`${size}px`}
            className={`rounded-full border object-cover ${className}`}
            priority
            fetchPriority="high"
        />
    );
}
