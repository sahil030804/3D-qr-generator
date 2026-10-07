import { describe, expect, it } from 'vitest';
import { embedSnippet, embedUrl, parseCommand, parseEmbed } from './embed';

describe('embed options', () => {
  it('is off unless asked for', () => {
    expect(parseEmbed('')).toBeNull();
    expect(parseEmbed('?o=car&t=night')).toBeNull();
    expect(parseEmbed('?embed=0')).toBeNull();
  });

  it('reads plain text and sensible defaults', () => {
    const options = parseEmbed('?embed=1&text=https%3A%2F%2Fexample.com%2Fa%3Fb%3D1')!;
    expect(options.text).toBe('https://example.com/a?b=1');
    expect(options).toMatchObject({ background: 'sky', controls: true, hint: true, rotate: true, view: 'object', timeGiven: false });
  });

  it('reads every switch', () => {
    const options = parseEmbed('?embed=1&bg=transparent&controls=0&hint=0&rotate=0&view=scan&t=night')!;
    expect(options).toMatchObject({ background: 'transparent', controls: false, hint: false, rotate: false, view: 'scan', timeGiven: true });
  });

  it('ignores text that is empty or too long', () => {
    expect(parseEmbed('?embed=1&text=%20%20')!.text).toBeUndefined();
    expect(parseEmbed('?embed=1&text=' + 'x'.repeat(200))!.text).toBeUndefined();
  });

  it('reads a photo from the hash, defaulting an unknown look to auto', () => {
    expect(parseEmbed('?embed=1')!.photo).toBeUndefined();
    const withPhoto = parseEmbed('?embed=1', '#img=QQ&mime=image%2Fjpeg&look=firm')!;
    expect(withPhoto.photo).toEqual({ data: 'QQ', mime: 'image/jpeg', look: 'firm' });
    expect(parseEmbed('?embed=1', '#img=QQ&mime=image%2Fjpeg&look=not-a-look')!.photo?.look).toBe('auto');
    expect(parseEmbed('?embed=1', '#img=QQ')!.photo).toBeUndefined(); // no mime: not enough to decode
  });
});

describe('embed snippet', () => {
  const source = { text: 'https://example.com/a?b=1&c=2', objectId: 'car', variantId: 'blue', time: 'dusk' };

  it('builds a link that round-trips through the parser', () => {
    const url = embedUrl('https://qr.example.org/app/index.html?old=1#hash', source, { bg: 'transparent' });
    expect(url.startsWith('https://qr.example.org/app/index.html?')).toBe(true);
    expect(url).not.toContain('old=1');
    const query = new URL(url).search;
    expect(parseEmbed(query)!.text).toBe(source.text);
    expect(new URLSearchParams(query).get('o')).toBe('car');
    expect(parseEmbed(query)!.background).toBe('transparent');
  });

  it('escapes ampersands so the HTML stays valid', () => {
    const html = embedSnippet(embedUrl('https://qr.example.org/', source));
    expect(html).toContain('&amp;o=car');
    expect(html).not.toMatch(/src="[^"]*&[^a]/);
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('aspect-ratio:1/1');
  });

  it('carries a photo in the hash, never the query, and round-trips it through the parser', () => {
    const photoSource = { ...source, objectId: 'photo' };
    const url = embedUrl('https://qr.example.org/', photoSource, { photo: { data: 'QQ_-', mime: 'image/jpeg', look: 'max' } });
    const parsed = new URL(url);
    expect(parsed.search).not.toContain('img=');
    expect(parsed.search).not.toContain('QQ_-');
    expect(parseEmbed(parsed.search, parsed.hash)!.photo).toEqual({ data: 'QQ_-', mime: 'image/jpeg', look: 'max' });
  });
});

describe('host commands', () => {
  it('accepts only the known commands from the known source', () => {
    expect(parseCommand({ source: 'voxel-qr-host', command: 'reveal' })).toBe('reveal');
    expect(parseCommand({ source: 'voxel-qr-host', command: 'toggle' })).toBe('toggle');
    expect(parseCommand({ source: 'voxel-qr-host', command: 'rm -rf' })).toBeNull();
    expect(parseCommand({ source: 'someone-else', command: 'reveal' })).toBeNull();
    expect(parseCommand('reveal')).toBeNull();
    expect(parseCommand(null)).toBeNull();
  });
});
