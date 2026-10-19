!macro customInstall
  ; デスクトップショートカットのアイコンを exe に明示（古い Electron アイコンキャッシュ対策）
  CreateShortCut "$DESKTOP\${PRODUCT_NAME}.lnk" "$INSTDIR\${PRODUCT_FILENAME}.exe" "" "$INSTDIR\${PRODUCT_FILENAME}.exe" 0
!macroend
