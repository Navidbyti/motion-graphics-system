; Long-path-safe removal of the previous install.
;
; NSIS's RMDir /r uses the ANSI path APIs, which stop at Windows' MAX_PATH of
; 260 characters. A deep node_modules tree pushes files past that, and then
; every upgrade fails at the uninstall-old-files step with
;
;   "Failed to uninstall old application files. Please try running the
;    installer again.: 2"
;
; The app becomes permanently un-upgradable, and nothing in the message points
; at path length. The staged engine no longer produces such paths (see
; scripts/stage-engine.mjs, which now hoists and fails the build if any path
; would exceed the limit), but an installation made by an OLDER build still
; contains them — so removal itself has to cope.
;
; robocopy is the tool that does: it uses the Unicode APIs natively and handles
; long paths without the \\?\ prefix. Mirroring an empty directory over the
; target empties it, after which the (now shallow) directory removes normally.

!macro customRemoveFiles
  ; /MIR mirrors the empty dir onto $INSTDIR, deleting everything in it.
  ; The quiet flags keep the installer from flashing a console full of output.
  CreateDirectory "$PLUGINSDIR\empty"
  nsExec::Exec 'cmd.exe /c robocopy "$PLUGINSDIR\empty" "$INSTDIR" /MIR /NJH /NJS /NP /NFL /NDL /R:1 /W:1'
  Pop $0

  ; robocopy exit codes below 8 are success; anything else falls through to the
  ; ordinary removal, which is still correct for a normal-depth install.
  RMDir /r "$INSTDIR"
!macroend
