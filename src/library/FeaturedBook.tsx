import { ArrowRight, Asterisk } from 'lucide-react';
import type { ShelfEntry } from '../model';
import { Cover } from './Cover';
import { sample } from './collection';

interface Props {
  book?: ShelfEntry;
  busy: boolean;
  onOpen: () => void;
}

function featureCopy(book?: ShelfEntry) {
  if (!book)
    return {
      label: 'Inside your first book',
      description: 'Explore an illustrated notebook from the coast.',
      action: 'Read the sample',
    };
  if (book.openedAt)
    return {
      label: 'Pick up where you left off',
      description: 'Your place is saved.',
      action: 'Continue reading',
    };
  return { label: 'From your bookshelf', description: book.title, action: 'Start reading' };
}

export function FeaturedBook({ book, busy, onOpen }: Props) {
  const hero = book ?? sample;
  const copy = featureCopy(book);
  return (
    <section className="feature" aria-label="Featured book">
      <div className="feature-copy">
        <div className="eyebrow feature-label">
          <Asterisk size={17} strokeWidth={1.3} />
          {copy.label}
        </div>
        <h2>
          {book?.openedAt ? (
            <>
              Welcome back
              <br />
              to <em>your story.</em>
            </>
          ) : (
            <>
              A book to
              <br />
              <em>begin with.</em>
            </>
          )}
        </h2>
        <p>{copy.description}</p>
        <button className="green-button" disabled={busy} onClick={onOpen}>
          {copy.action}
          <ArrowRight size={17} />
        </button>
      </div>
      <div className="feature-art" aria-hidden="true">
        <div className="orbit outer-orbit" />
        <div className="orbit inner-orbit" />
        <div className="sun" />
        <Asterisk className="star star-one" strokeWidth={1} />
        <span className="star star-two">✧</span>
        <div className="hero-cover">
          <Cover {...hero} />
        </div>
        <div className="hero-caption">
          <strong>{hero.title}</strong>
          <span>{hero.author}</span>
        </div>
      </div>
    </section>
  );
}
