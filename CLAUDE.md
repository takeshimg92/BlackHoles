# Visualizing black hole mergers & gravitational waves

Our objective is to build an application to visualize the inspiral of black hole / neutron star binaries and the generated waveforms. This is meant as an educational app to help students and researchers easily browse through simulations, visualize how they lead to different waveforms, and listen to the "chirp" of the wave!

To do this, you are required to start your research finding reliable, good quality sources of binary merger simulations. For example:

* SXS reference paper: https://arxiv.org/abs/2505.13378 - source LaTeX file available in `assets/arXiv-2505.13378v2/catalog-update.tex`
* The SXS data is available in the `sxs` Python package; we should prioritize using the undeprecated, newer data if possible
(OBS: for SXS data, if we decide to use it, make it be downloaded automatically downloaded `https://arxiv.org/src/2505.13378` and unzipped)

# The app

* There must be a "main" screen where the merger is shown as a mesh animation
  * There must be a button to toggle "mesh view on/off"; if on, we see the "gridlines" of spacetime meshes
  * There must be a "time" slider allowing to move the animation forwards or backwards.
  * The background should be stars from the Yale Bright Star Catalog; you can use the same implementation in `../StarSimulator` to pick a few; the JSON file `/Users/alessandro/sandbox/StarSimulator/src/data/bsc_stars.json` may be of interest

  As a general idea of the desired visualization, the image below may serve as a reference:
  ![alt text](assets/binary_image.png)

* There must be a "control dashboard" tab. For v1, it only allows to scroll through the catalog of simulations (in future versions we will add ability to control the masses, spins and types of each element of the binary)
* There must be a "waveform" view. It must show, in gray, the waveform $h(t)$; in black, as the animation evolves in time, the evolution of the waveform. 
  * There must be a button to toggle "sound on/off" -- if on, we play the equivalent chirp for the waveform as it evolves
* Other information, such as the mass ratios, spins, etc should be available as text on top of the dashboard
* (If possible) I want to represent the waves propagating outwards as spiral-like deformations of a baseline 2D mesh, which represents the orbital plane of the binaries.
* I am open to other suggestions of things to show, like the evolution of ADM mass/angular momentum, Christodoulou masses, energy % carried away by the wave at time t, etc.
* Having a "lensing" effect around the black holes is a crucial part of the app experience, as is the sound of the chirp. 
* The visualization of the gravitational waves radiating away, in a manner that somehow resambles the waveform that is being shown simultaneously in the other tab, adds a very concrete experience to the user. In fact, sound has a big effect here; having e.g. a (Doppler-like) "voom" modulation as a body approaches the camera and goes away adds to the experience.

## Approximations

Of course, we are not directly solving numerical relativity equations ourselves. 
* If data is available on masses and spins, we can make the black holes be ellipsoidal blobs to replicate the shape.
* We can use quasi-Keplerian orbits to emulate nicely the speed variation of the objects as they orbit around each other
* I am open to suggestions of how to represent the bodies and their motion in a fast enough way that does not hinder the user experience.

## Aesthetics

We want a dark, sleek, futuristic and minimalistic theme. An "Interstellar (2014)"-like vibe.


## General orientations
* Do not add yourself (Claude) as a collaborator
* To the extent that is possible, always plan before acting. In particular, if the user is still discussing with you, do not start making code changes
* Keep a thorough log of your activities in CHANGELOG.md
* If you decide to use *Python*, use `uv` to manage the project. Prefer Python >= 3.12 if possible.
