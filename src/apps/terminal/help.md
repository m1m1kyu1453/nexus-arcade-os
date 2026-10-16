# Terminal

A command line for your Nexus files and apps. It understands the usual shell syntax, so most
things you know from Linux or macOS work the same way.

Type `help` for all commands and `man <command>` for the details of one.

## Getting around

```sh
pwd                      # where am I?
ls -la                   # what's here (with hidden files and details)
cd Documents             # go into a folder; "cd" alone goes home, "cd -" goes back
tree -L 2                # the folder as a tree
open notes.md            # open a file with its app (or a folder in the File Explorer)
open files               # start an app by name or id
```

## Shell features

| Feature               | Example                                                   |
| --------------------- | --------------------------------------------------------- |
| Quoting and escaping  | `cat "my notes.txt"`, `cat my\ notes.txt`                 |
| Pipes                 | `cat todo.txt \| sort \| uniq -c`                         |
| Write / append / read | `ls > list.txt`, `echo hi >> log.txt`, `wc -l < list.txt` |
| Errors to a file      | `grep x missing.txt 2> errors.txt`, `… 2>&1`              |
| Run if / unless       | `mkdir build && cd build`, `cd x \|\| echo nope`          |
| Several commands      | `cd ~; ls`                                                |
| Variables             | `export NAME=Ada`, `echo "Hi $NAME"`, `$HOME`, `$?`       |
| Home folder           | `cd ~/Music`                                              |
| Wildcards             | `ls *.md`, `cp Pictures/*.png Desktop`                    |
| Aliases               | `alias ll='ls -la'`                                       |

Variables are never split into several words, so a value with spaces stays one argument.

## Keys

| Key                                           | Does                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| <kbd>Tab</kbd>                                | Complete commands, file names and app ids (twice: list)                          |
| <kbd>↑</kbd> / <kbd>↓</kbd>                   | Previous / next command                                                          |
| <kbd>Ctrl</kbd>+<kbd>R</kbd>                  | Search the history (again for older matches)                                     |
| <kbd>Ctrl</kbd>+<kbd>C</kbd>                  | Stop the running command (copies when text is selected)                          |
| <kbd>Ctrl</kbd>+<kbd>L</kbd>                  | Clear the screen                                                                 |
| <kbd>Ctrl</kbd>+<kbd>U</kbd> / <kbd>W</kbd>   | Delete to the line start / the word before the cursor                            |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd> | Copy the selection                                                               |
| <kbd>Alt</kbd>+<kbd>T</kbd>                   | New tab; <kbd>Alt</kbd>+<kbd>1</kbd>…<kbd>9</kbd> switch tabs; `exit` closes one |

The history is shared by all tabs and kept between sessions: `history` lists it, `!12` runs entry
12 again, `!!` the last command, `!cd` the newest one starting with "cd".

## Working with the rest of Nexus

- `rm` moves things to the **Trash** (restore them in the File Explorer); `rm -P` deletes for good.
- `ps` lists open windows and `kill` closes them, `apps` lists your apps.
- `theme`, `wallpaper <image>`, `notify <text>` and `calc <expression>` change and use the system.
- `nexusfetch` shows system information.
- Apps can add their own commands; `help` lists them under "Commands from apps", for example
  `explore ~/Pictures` from the File Explorer.

A file named `.nexusrc` in your home folder runs when a Terminal window opens: put your aliases
and variables there.

**Open terminal here:** right-click a folder in the File Explorer or the desktop.
