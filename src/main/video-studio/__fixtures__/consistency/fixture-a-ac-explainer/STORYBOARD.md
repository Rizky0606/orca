---
format: 1080x1920
duration: 9s
styleProfile: technical-explainer-01
---

## Frame 1 — Room Heat Hook

- scene_id: scene_hook
- status: built
- duration: 3s
- transition_in: cut
- engine: hyperframes
- src: compositions/01-hook.html
- assets: ac_indoor_001:closed
- motion_presets: camera.smooth_zoom
- camera: orthographic
- narrative_role: Hook
- voiceover: Your AC unit never manufactures cold air inside your room.

## Frame 2 — Evaporator Cutaway

- scene_id: scene_cutaway
- status: animated
- duration: 3s
- transition_in: slide
- engine: hyperframes
- src: compositions/02-cutaway.html
- assets: ac_indoor_001:cutaway
- motion_presets: diagram.flow_path
- camera: orthographic
- narrative_role: Mechanism
- voiceover: Cold liquid refrigerant boils across the evaporator coils.

## Frame 3 — Heat Rejection Cycle

- scene_id: scene_operating
- status: animated
- duration: 3s
- transition_in: slide
- engine: hyperframes
- src: compositions/03-operating.html
- assets: ac_indoor_001:operating
- motion_presets: diagram.flow_path
- camera: orthographic
- narrative_role: Conclusion
- voiceover: The spinning blower moves cool air while heat exits outdoors.
