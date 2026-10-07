"""Read official TPZ entries without extracting or executing them."""
import io
import json
import struct
import sys
import zipfile

archive, identifier = sys.argv[1:]
LIMIT = 512 * 1024 * 1024

def entry(z, name):
    matches = [item for item in z.infolist() if item.filename == name]
    if len(matches) != 1 or not 0 < matches[0].file_size <= LIMIT:
        raise ValueError("Missing, duplicate or oversized template entry: " + name)
    return matches[0]

def header(z, item, length):
    with z.open(item) as stream:
        return stream.read(length)

rows = []
with zipfile.ZipFile(archive) as outer:
    version = entry(outer, "templates/version.txt")
    if version.file_size > 64 or outer.read(version).decode().strip() != identifier:
        raise ValueError("Official archive version.txt does not match the requested release")
    for platform in ("windows", "linux", "web"):
        for kind in ("release", "debug"):
            for threads in ((False, True) if platform == "web" else (False,)):
                name = (f"windows_{kind}_x86_64.exe" if platform == "windows" else
                        f"linux_{kind}.x86_64" if platform == "linux" else
                        f"web_{kind}.zip" if threads else f"web_nothreads_{kind}.zip")
                item = entry(outer, "templates/" + name)
                if platform == "web":
                    with zipfile.ZipFile(io.BytesIO(outer.read(item))) as nested:
                        wasm = entry(nested, "godot.wasm")
                        if header(nested, wasm, 8) != b"\x00asm\x01\x00\x00\x00":
                            raise ValueError("Invalid official WASM header")
                        size = wasm.file_size
                else:
                    data = header(outer, item, 65536)
                    if platform == "windows":
                        if len(data) < 64 or data[:2] != b"MZ":
                            raise ValueError("Invalid official PE header")
                        offset = struct.unpack_from("<I", data, 60)[0]
                        if offset < 64 or offset + 94 > len(data) or data[offset:offset+4] != b"PE\x00\x00" or struct.unpack_from("<H", data, offset+4)[0] != 0x8664 or struct.unpack_from("<H", data, offset+24)[0] != 0x20B or struct.unpack_from("<H", data, offset+92)[0] != 2:
                            raise ValueError("Expected official x86_64 GUI executable")
                    elif len(data) < 20 or data[:4] != b"\x7fELF" or data[4:6] != b"\x02\x01" or struct.unpack_from("<H", data, 18)[0] != 62:
                        raise ValueError("Expected official x86_64 ELF executable")
                    size = item.file_size
                rows.append(dict(platform=platform, architecture="wasm32" if platform == "web" else "x86_64", template_kind=kind, web_threads=threads, binary_size_bytes=size))
print(json.dumps(rows))
