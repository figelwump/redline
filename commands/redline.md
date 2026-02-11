---
name: redline
description: Pick up the latest Redline annotated screenshot and start working on the feedback
---

Read `~/.redline/feedback/latest.json` to get the path, source URL, and timestamp of the most recent Redline annotation.

Then read the screenshot image at that path. The image is an annotated screenshot — it will contain visual markup (arrows, boxes, highlights, text notes, etc.) that represent feedback on a UI.

First call out your initial intepretation of the screenshot so you can give the user quick confirmation feedback that you found the right screenshot and are working on it.

Then analyze the screenshot and describe:
1. **What page/component** is shown (use the URL from the metadata for context)
2. **What the annotations are calling out** — be specific about each marked-up area
3. **What changes are being requested** — infer the intent behind each annotation

Then determine which files in the current project are relevant to the feedback, read them, and propose a concrete plan to address the feedback. If the feedback is unambiguous and the fix is straightforward, go ahead and implement it.
