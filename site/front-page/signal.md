# 767-2676.com signal mapping

Spec: 767-2676-tone-plan. Version: 1.2.0.

## Four panels, four phases

| Phase | Reference frequency | Beacon action | Interval in each cycle |
| --- | --- | --- | --- |
| NEED | 350 Hz | Three dots | 0–720 ms |
| YES | 440 Hz | Three dashes | 720–2160 ms |
| BOUNDARY | 480 Hz | Three dots | 2160–2760 ms |
| TIME | 620 Hz | Silence; no oscillator or vibration | 2760–3600 ms |

Frequency is the carrier. The pattern is the message. The 620 Hz reference remains readable, but TIME emits no tone in this sequence. Version 1.2.0 replaces version 1.1.0's separate 600 Hz loop and standalone panel-tone buttons.

Dot = 120 ms; dash = 360 ms; element gap = 120 ms. The nine-element SOS prosign has no inter-letter gaps. The final silent phase lasts 840 ms (seven units). A full cycle lasts 3600 ms. The end-of-element gap after NEED and YES is included in those phases. The pulse envelope is visible as three short, three long and three short marks, followed by a flat silence track.

## Start, stop and outputs

- Start beacon starts the repeating sequence. No autoplay.
- Audio uses sine waves with 8 ms attack and 15 ms release. NEED is 350 Hz, YES is 440 Hz, BOUNDARY is 480 Hz; TIME is silent.
- A shared timeline drives audio scheduling, visible phase/pulse state and vibration pulses. Web Audio output timestamps align visuals and vibration with audio when supported. Browser and device latency still limit physical synchronization.
- Haptics use navigator.vibrate for the remaining duration of the current pulse. They follow rhythm, not audio pitch. API availability/acceptance does not confirm that a physical motor vibrated. Users can turn vibration off.
- When audio is unavailable, visual and available haptic timing continue on the performance clock. When vibration is unavailable, audio and visuals still work.
- Stop beacon, hiding the page, leaving the page, or interrupting active audio clears playback, visual state and vibration. Returning does not automatically resume.
- Late frames show the current phase. Missed pulses are skipped, not replayed in a catch-up burst.
- Reduced-motion mode leaves the pulse diagram static while retaining a readable current-phase label. The regular mode emphasizes small pulse marks rather than flashing entire panels.
- Phase state is also readable as data-current-phase and data-pulse on the panels container. Labels, frequencies and phase patterns are HTML text/attributes. Screen readers are not interrupted at every pulse.

This is a local beacon rendering. It does not contact a peer, transmit a network message, listen through a microphone, submit a help request, authenticate a visitor, or create a signed time witness.

Existing non-beacon reference mappings remain documented: GO_AHEAD = 350 + 440 Hz; WAITING = 440 + 480 Hz; NO = 480 + 620 Hz; PROCEED = 1000 Hz for 800 ms. These are not played by this beacon.

Morse timing reference: [ITU-R M.1677-1](https://www.itu.int/rec/R-REC-M.1677-1-200910-I/). Haptic limitations: [Navigator.vibrate](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate). The site-specific assignment of pitches to SOS phases is not an ITU-standard frequency plan.

The JSON stays at tone-spec.v1.json with internal version 1.2.0. Future changes to timing or frequency mapping require a version update.

## Machine-readable score

Agents read https://767-2676.com/agent-entry/beacon.json, the beacon field in /agent-entry.json, or the application/json script with id sos-beacon in /agent-entry. These contain identical phase data. Human playback on agent-entry reads the embedded score. TIME has frequencyHz null and no pulses. Reading the pattern requires no playback, JavaScript execution, or microphone.
