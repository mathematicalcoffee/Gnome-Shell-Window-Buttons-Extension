Gnome 3 Window Buttons Extension
================================

This is an extension for Gnome 3 which puts minimize, maximize and close buttons in the top panel.

Supports custom button layouts and css theming!

You have to restart gnome-shell to apply a new theme properly.

Currently the buttons only control the active window.

Configure with `gnome-shell-extension-prefs` (GNOME 3.4) or by editing `extension.js` (GNOME 3.2).

Installation
------------
### GNOME 3.4
Either download the .zip file from the [Downloads page](https://github.com/biox/Gnome-Shell-Window-Buttons-Extension/downloads) or checkout the code to the `gnome3.4` branch.

If you have the .zip file, go to Gnome tweak tools --> Shell Extensions --> Install from zip file --> choose the zip file.

If you have the source code, copy the folder to the appropriate place:

	$ cp window_buttons@biox.github.com ~/.local/share/gnome-shell/extensions/

Configure using `gnome-shell-extension-prefs`.

### GNOME 3.2
As above (but if you are checking out the code, use the `gnome3.2` branch).

You will also have to add `'window_buttons@biox.github.com'` to the `org.gnome.shell enabled-extensions` key.

**NOTE**: previous versions of this extension allowed you to copy a settings file to `/usr/share` to configure the extension with `dconf-editor`; this has been discontinued because the extension won't pass review on https://extensions.gnome.org if it asks you to do anything requiring root access like that.

You must configure by editing the `extension.js` file.

To-do
-----

- Check for theme matching metacity theme
- Add unfocused window support for better theming
- Add option to handle only maximized windows
- Add option to hide if there are no maximized windows
- Moar themes!

Version map
-----------
For 'version', see 'version' in metadata.json (this is the version of the extension as it appears/is planned for on extensions.gnome.org).

- v1: GNOME 3.2-compatible.
- v2: GNOME 3.4-compatible.
- 
