Mod tracks
==========

Put track files here to race them in the game as "Mod Track" on the venue road.

A track file is what the track editor's Export button makes: <track id>.track.json.
Every .json file in this folder (except index.json) is picked up when the game is
built or run with `npm run dev`, and listed in the game by the track's name, with the
file name under it.

Each track gets the same checks as the game's own tracks: a start straight with its gate,
sections the game knows, the start official's spot and walk, and only the game's own
surfaces, ground and scenery. A track that fails is still listed, greyed out, with the reason.

Mod tracks are 50cc race days against the local field, with the same entry fee, prize money,
XP and parts wear as Farmland MX. There is no practice or venue area: picking one goes
straight to the gate pick.

In the published game you can also import a .track.json from your device with
"Import track file" in the mod track list. Imported tracks are kept in that browser only.

first-try-mx.track.json is First Try MX, a small example track to copy and change.
