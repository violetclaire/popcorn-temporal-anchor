# 767-2676.com signal mapping
Spec: 767-2676-tone-plan
Version: 1.0.0

GO_AHEAD = 350 + 440 Hz
WAITING = 440 + 480 Hz
NO = 480 + 620 Hz
PROCEED = 1000 Hz; sine wave; 800 ms; single tone, never a chord.

The first three pairs use the component frequencies of North American dial, ringback, and busy tones respectively. Historical telephone signals also depend on cadence; the pairs alone do not specify a complete telephone signal.

The 1000 Hz / 800 ms PROCEED mapping is this site's chosen reference signal. Playing a tone does not create a signed witness or establish authorization. This file documents the signal mapping; it does not implement a decision endpoint.

Front-page tones:
NEED = 350 Hz
YES = 440 Hz
BOUNDARY = 480 Hz
TIME = 620 Hz

Each heading plays its single sine-wave frequency for 1200 ms, with a 40 ms attack and 100 ms release. Playback requires a tap, click, or keyboard activation. No autoplay.

The visible frequency, data-frequency-hz, and llms.txt mapping must agree. Agents can read the values without processing audio.

Any change to a frequency or signal mapping requires a new specification version. The former 220/330/440/660 preview values were unversioned draft choices.

