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

Themes
------
The Window Buttons extension is themeable.
Themes live in the `themes`. The name of the directory is the name of the theme.

If you want to make your own theme, you have to add a folder into the `themes` directory.
To start off, copy the `default` theme:

    $ cd window_buttons@biox.github.com/themes
    $ cp -r default my_new_theme 

Then, edit the `style.css` file to style the window buttons. At a bare minimum,
 you need to define styles for `.window-button`, `.minimize`, `.maximize` and `.close`.

The `.window-button` style affects each individual button.
The `.minimize`, `.maximize` and `.close` styles define the styles for each individual button.
You will have to do something like

    background-img: url("path/to/picture")

for each button, and the picture should have the symbol for the button in it (i.e. we do not draw `_`, `X`, etc on the buttons).

See `themes/default/style.css` for more information.

To-do
-----

- Add unfocused window support for better theming
- Add option to handle only maximized windows
- Add option to hide if there are no maximized windows
- Modify themes so that we handle drawing the icon and only the background image need be provided?
- Moar themes!

Version map
-----------
For 'version', see 'version' in metadata.json (this is the version of the extension as it appears/is planned for on extensions.gnome.org).

- v1: GNOME 3.2-compatible.
- v2: GNOME 3.4-compatible.
