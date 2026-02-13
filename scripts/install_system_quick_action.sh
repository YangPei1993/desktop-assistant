#!/usr/bin/env bash
set -euo pipefail

SERVICE_DIR="$HOME/Library/Services"
TEXT_WORKFLOW_NAME="Ask Desktop Assistant"
FILE_WORKFLOW_NAME="Ask Desktop Assistant Files"
LEGACY_WORKFLOW_NAME="Ask Desktop Assistant"

COMMON_SCRIPT='set -euo pipefail

INPUT_TEXT=""
if [ ! -t 0 ]; then
  INPUT_TEXT="$(cat || true)"
fi

PAYLOAD_PATH="${TMPDIR:-/tmp}/desktop-assistant-quick-ask-$$-$RANDOM.json"

python3 - "$PAYLOAD_PATH" "$INPUT_TEXT" "$@" <<"PY"
import json
import os
import sys
import urllib.parse

payload_path = sys.argv[1]
text = sys.argv[2] if len(sys.argv) >= 3 else ""
raw_items = sys.argv[3:]

files = []
for raw in raw_items:
    value = (raw or "").strip()
    if not value:
        continue
    if value.startswith("file://"):
        parsed = urllib.parse.urlparse(value)
        value = urllib.parse.unquote(parsed.path or "")
    if value and os.path.isfile(value):
        files.append(os.path.abspath(value))

text_lines = [line.strip() for line in text.splitlines() if line.strip()]
if not files and text_lines:
    maybe_files = []
    for line in text_lines:
        candidate = line
        if line.startswith("file://"):
            parsed = urllib.parse.urlparse(line)
            candidate = urllib.parse.unquote(parsed.path or "")
        if candidate and os.path.isfile(candidate):
            maybe_files.append(os.path.abspath(candidate))
    if maybe_files:
        files = maybe_files
        text = ""

payload = {
    "text": text.strip(),
    "files": files,
}
with open(payload_path, "w", encoding="utf-8") as fp:
    json.dump(payload, fp, ensure_ascii=False)
PY

ENCODED_PATH="$(python3 - "$PAYLOAD_PATH" <<"PY"
import sys
import urllib.parse
print(urllib.parse.quote(sys.argv[1]))
PY
)"

open "desktopassistant://quick-ask-file?path=${ENCODED_PATH}" >/dev/null 2>&1 || open "desktopassistant://quick-ask-clipboard" >/dev/null 2>&1
'

write_workflow() {
  local workflow_name="$1"
  local bundle_id="$2"
  local send_type_mode="$3"   # text or file
  local input_method="$4"     # 0 stdin, 1 argv
  local input_type_identifier="$5"

  local workflow_dir="$SERVICE_DIR/${workflow_name}.workflow"
  local contents_dir="$workflow_dir/Contents"
  local resources_dir="$contents_dir/Resources"
  local info_plist="$contents_dir/Info.plist"
  local wflow_plist="$resources_dir/document.wflow"

  mkdir -p "$resources_dir"

  if [ "$send_type_mode" = "text" ]; then
    cat > "$info_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en_US</string>
  <key>CFBundleIdentifier</key>
  <string>${bundle_id}</string>
  <key>CFBundleName</key>
  <string>${workflow_name}</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>${workflow_name}</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSSendTypes</key>
      <array>
        <string>public.utf8-plain-text</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST
  else
    cat > "$info_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en_US</string>
  <key>CFBundleIdentifier</key>
  <string>${bundle_id}</string>
  <key>CFBundleName</key>
  <string>${workflow_name}</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>NSServices</key>
  <array>
    <dict>
      <key>NSMenuItem</key>
      <dict>
        <key>default</key>
        <string>${workflow_name}</string>
      </dict>
      <key>NSMessage</key>
      <string>runWorkflowAsService</string>
      <key>NSSendFileTypes</key>
      <array>
        <string>public.item</string>
      </array>
    </dict>
  </array>
</dict>
</plist>
PLIST
  fi

  cat > "$wflow_plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>AMApplicationBuild</key>
  <string>346</string>
  <key>AMApplicationVersion</key>
  <string>2.3</string>
  <key>AMDocumentVersion</key>
  <string>2</string>
  <key>actions</key>
  <array>
    <dict>
      <key>action</key>
      <dict>
        <key>AMAccepts</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Optional</key>
          <true/>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.string</string>
            <string>com.apple.cocoa.path</string>
          </array>
        </dict>
        <key>AMActionVersion</key>
        <string>2.0.3</string>
        <key>AMApplication</key>
        <array>
          <string>Automator</string>
        </array>
        <key>AMParameterProperties</key>
        <dict>
          <key>COMMAND_STRING</key>
          <dict/>
          <key>CheckedForUserDefaultShell</key>
          <dict/>
          <key>inputMethod</key>
          <dict/>
          <key>shell</key>
          <dict/>
          <key>source</key>
          <dict/>
        </dict>
        <key>AMProvides</key>
        <dict>
          <key>Container</key>
          <string>List</string>
          <key>Types</key>
          <array>
            <string>com.apple.cocoa.string</string>
          </array>
        </dict>
        <key>ActionBundlePath</key>
        <string>/System/Library/Automator/Run Shell Script.action</string>
        <key>ActionName</key>
        <string>Run Shell Script</string>
        <key>ActionParameters</key>
        <dict>
          <key>COMMAND_STRING</key>
          <string><![CDATA[${COMMON_SCRIPT}]]></string>
          <key>CheckedForUserDefaultShell</key>
          <true/>
          <key>inputMethod</key>
          <integer>${input_method}</integer>
          <key>shell</key>
          <string>/bin/bash</string>
          <key>source</key>
          <string></string>
        </dict>
        <key>BundleIdentifier</key>
        <string>com.apple.RunShellScript</string>
        <key>CFBundleVersion</key>
        <string>2.0.3</string>
        <key>CanShowSelectedItemsWhenRun</key>
        <false/>
        <key>CanShowWhenRun</key>
        <true/>
        <key>Category</key>
        <array>
          <string>AMCategoryUtilities</string>
        </array>
        <key>Class Name</key>
        <string>RunShellScriptAction</string>
        <key>InputUUID</key>
        <string>3E130DE0-EF0A-4E50-95A7-1C5263D0B8E8</string>
        <key>Keywords</key>
        <array>
          <string>Shell</string>
          <string>Script</string>
          <string>Run</string>
        </array>
        <key>OutputUUID</key>
        <string>36C6F698-E677-4453-89C8-E9254AB243A5</string>
        <key>UUID</key>
        <string>96B12D84-0EA6-4C45-A6F3-52D79E4BE1DE</string>
        <key>UnlocalizedApplications</key>
        <array>
          <string>Automator</string>
        </array>
        <key>arguments</key>
        <dict>
          <key>0</key>
          <dict>
            <key>default value</key>
            <integer>${input_method}</integer>
            <key>name</key>
            <string>inputMethod</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>0</string>
          </dict>
          <key>1</key>
          <dict>
            <key>default value</key>
            <string></string>
            <key>name</key>
            <string>source</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>1</string>
          </dict>
          <key>2</key>
          <dict>
            <key>default value</key>
            <false/>
            <key>name</key>
            <string>CheckedForUserDefaultShell</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>2</string>
          </dict>
          <key>3</key>
          <dict>
            <key>default value</key>
            <string></string>
            <key>name</key>
            <string>COMMAND_STRING</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>3</string>
          </dict>
          <key>4</key>
          <dict>
            <key>default value</key>
            <string>/bin/sh</string>
            <key>name</key>
            <string>shell</string>
            <key>required</key>
            <string>0</string>
            <key>type</key>
            <string>0</string>
            <key>uuid</key>
            <string>4</string>
          </dict>
        </dict>
        <key>isViewVisible</key>
        <true/>
        <key>location</key>
        <string>309.500000:631.000000</string>
        <key>nibPath</key>
        <string>/System/Library/Automator/Run Shell Script.action/Contents/Resources/en.lproj/main.nib</string>
      </dict>
      <key>isViewVisible</key>
      <true/>
    </dict>
  </array>
  <key>connectors</key>
  <dict/>
  <key>state</key>
  <dict>
    <key>AMLogTabViewSelectedIndex</key>
    <integer>0</integer>
  </dict>
  <key>workflowMetaData</key>
  <dict>
    <key>serviceApplicationBundleID</key>
    <string></string>
    <key>serviceApplicationPath</key>
    <string></string>
    <key>serviceInputTypeIdentifier</key>
    <string>${input_type_identifier}</string>
    <key>serviceOutputTypeIdentifier</key>
    <string>com.apple.Automator.nothing</string>
    <key>serviceProcessesInput</key>
    <integer>1</integer>
    <key>workflowTypeIdentifier</key>
    <string>com.apple.Automator.servicesMenu</string>
  </dict>
</dict>
</plist>
PLIST

  /usr/bin/plutil -lint "$info_plist" >/dev/null
  /usr/bin/plutil -lint "$wflow_plist" >/dev/null
}

mkdir -p "$SERVICE_DIR"
rm -rf "$SERVICE_DIR/${LEGACY_WORKFLOW_NAME}.workflow"
rm -rf "$SERVICE_DIR/${FILE_WORKFLOW_NAME}.workflow"

write_workflow "$TEXT_WORKFLOW_NAME" "com.yangpei.services.askdesktopassistant" "text" "0" "com.apple.Automator.text"
write_workflow "$FILE_WORKFLOW_NAME" "com.yangpei.services.askdesktopassistant.files" "file" "1" "com.apple.Automator.fileSystemObject"

/System/Library/CoreServices/pbs -flush >/dev/null 2>&1 || true
/System/Library/CoreServices/pbs -update >/dev/null 2>&1 || true

echo "Installed services:"
echo "- $SERVICE_DIR/${TEXT_WORKFLOW_NAME}.workflow"
echo "- $SERVICE_DIR/${FILE_WORKFLOW_NAME}.workflow"
echo "If not shown yet, log out/in once or reboot Finder."
