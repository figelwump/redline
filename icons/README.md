# Icon Options

Redline ships with three icon concepts:

- `option-a`: red gradient with annotation frame + pen (current default)
- `option-b`: dark slate with orange markup + note bubble
- `option-c`: blue focus frame + target center

Generated assets:

- `icons/option-a/icon16.png`, `icons/option-a/icon32.png`, `icons/option-a/icon48.png`, `icons/option-a/icon128.png`
- `icons/option-b/icon16.png`, `icons/option-b/icon32.png`, `icons/option-b/icon48.png`, `icons/option-b/icon128.png`
- `icons/option-c/icon16.png`, `icons/option-c/icon32.png`, `icons/option-c/icon48.png`, `icons/option-c/icon128.png`

Active icons used by `manifest.json` live in `icons/current/`.

To switch to another option, copy that option into `icons/current/`, for example:

```bash
cp icons/option-b/icon16.png icons/current/icon16.png
cp icons/option-b/icon32.png icons/current/icon32.png
cp icons/option-b/icon48.png icons/current/icon48.png
cp icons/option-b/icon128.png icons/current/icon128.png
```
