// Moving files between the game and the player's device, for save export and import.

/**
 * Hands a text file to the player. On a phone or tablet the share sheet is used where it can take
 * files (Save to Files on iOS, Drive or Downloads on Android); elsewhere the file is downloaded.
 * Resolves to how it went: 'shared', 'downloaded' or 'cancelled'.
 */
export async function giveFile(name: string, text: string, type = 'application/json'): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([text], name, { type });
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (touch && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      // The player closed the share sheet: nothing more to do. Anything else falls back to a download.
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

/** Asks the player for a file from their device and passes on its name and text. */
export function pickFile(accept: string, onPick: (name: string, text: string) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  // Kept in the page until a file is picked: some mobile browsers drop a detached input's change.
  input.style.display = 'none';
  document.body.querySelectorAll('input[data-pick-file]').forEach((old) => old.remove());
  input.dataset.pickFile = '';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) void file.text().then((text) => onPick(file.name, text));
  });
  input.click();
}
