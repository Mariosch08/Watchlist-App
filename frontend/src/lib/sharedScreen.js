// Shared screen of a movie night: titles nobody attending has seen, and whose subscription to use.
const keyOf = (t) => `${t.media_type}:${t.tmdb_id}`;
const genitive = (name) => `${name}${/[sxzß]$/i.test(name) ? '’' : 's'}`;

// people: rows of night_screen(); ranked: the list's titles by votes; providers: key -> flatrate (or undefined while loading)
export function sharedScreen({ people = [], ranked = [], providers = new Map(), max = 5 }) {
  const going = people.filter((p) => p.attending);
  const group = going.length ? going : people;
  const seenBy = new Map();
  for (const p of group) for (const key of p.seen ?? []) seenBy.set(key, [...(seenBy.get(key) ?? []), p]);
  const open = ranked.filter((t) => !seenBy.has(keyOf(t)));
  const entries = open.slice(0, max).map((t) => {
    const flatrate = providers.get(keyOf(t));
    const owners = (flatrate ?? [])
      .map((provider) => ({ provider, owners: group.filter((p) => p.providers?.includes(provider.id)).sort((a, b) => Number(b.is_me) - Number(a.is_me)) }))
      .filter((x) => x.owners.length)
      .sort((a, b) => Number(b.owners[0].is_me) - Number(a.owners[0].is_me));
    return { item: t, key: keyOf(t), flatrate, owners };
  });
  return {
    group,
    attending: going.length > 0,
    entries,
    skipped: ranked.filter((t) => seenBy.has(keyOf(t))).map((t) => ({ item: t, by: seenBy.get(keyOf(t)).map((p) => p.display_name) })),
    hidden: group.filter((p) => p.providers == null).map((p) => p.display_name),
  };
}

// "Läuft auf Laras MUBI" / "Läuft auf deinem Netflix" / "In keinem Abo der Runde (bei Netflix)"
export function screenLine(entry) {
  if (!entry.flatrate) return 'Streaming wird geprüft …';
  if (!entry.owners.length) return entry.flatrate.length ? `In keinem Abo der Runde – läuft bei ${entry.flatrate.slice(0, 2).map((p) => p.name).join(', ')}` : 'In keinem Abo';
  const { provider, owners } = entry.owners[0];
  const owner = owners[0];
  return `Läuft auf ${owner.is_me ? 'deinem' : genitive(owner.display_name)} ${provider.name}`;
}
