import { Compass } from 'lucide-react';

interface Props {
  title: string;
  author: string;
  cover?: string;
}

export function Cover({ title, author, cover }: Props) {
  if (cover) return <img className="book-cover" src={cover} alt="" draggable={false} />;
  const hue = [...title].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
  return (
    <div
      className="book-cover typeset-cover"
      style={{ backgroundColor: `hsl(${hue} 19% 31%)` }}
      aria-hidden="true"
    >
      <Compass size={20} strokeWidth={1} />
      <strong>{title}</strong>
      <small>{author}</small>
    </div>
  );
}
