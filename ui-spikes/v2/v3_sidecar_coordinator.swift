// Scoped coordinated CAS replacement for V3 map/review + dedicated IR pointer.
// This executable is invoked by Mac Vault after auth, source validation, and
// expectedRevision checks. It performs the LAST revision check *within* the
// NSFileCoordinator write block; no general-purpose Vault overwrite API.
import Foundation
import Darwin

enum SafeReplaceError: Error, CustomStringConvertible {
  case invalid(String)
  case stale
  case coordination(String)
  case system(String)

  var description: String {
    switch self {
    case .invalid(let detail): return "INVALID " + detail
    case .stale: return "ESTALE revision differs under file coordination"
    case .coordination(let detail): return "ECOORDINATION " + detail
    case .system(let detail): return "EIO " + detail
    }
  }
}

func revision(at url: URL) throws -> String {
  var info = stat()
  if lstat(url.path, &info) != 0 {
    throw SafeReplaceError.system("cannot stat target")
  }
  guard (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG) else {
    throw SafeReplaceError.invalid("target is not a regular file")
  }
  let mtime = Int64(info.st_mtimespec.tv_sec) * 1_000_000_000 + Int64(info.st_mtimespec.tv_nsec)
  let ctime = Int64(info.st_ctimespec.tv_sec) * 1_000_000_000 + Int64(info.st_ctimespec.tv_nsec)
  return "\(info.st_dev):\(info.st_ino):\(mtime):\(ctime):\(info.st_size)"
}

func isRegularFile(_ url: URL) -> Bool {
  var info = stat()
  return lstat(url.path, &info) == 0 &&
    (info.st_mode & mode_t(S_IFMT)) == mode_t(S_IFREG)
}

func run() throws {
  guard CommandLine.arguments.count == 4 else {
    throw SafeReplaceError.invalid("expected destination, expectedRevision, temporaryFile")
  }
  let dest = URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
  let expected = CommandLine.arguments[2]
  let temp = URL(fileURLWithPath: CommandLine.arguments[3]).standardizedFileURL
  guard ["pdf-md-map.v1.json", "pdf-md-review.v1.json", "ir-current.v1.json", "ir-markings.v1.json", "chapters-map.v1.json"].contains(dest.lastPathComponent),
        dest.deletingLastPathComponent().lastPathComponent == ".ocr2md",
        temp.deletingLastPathComponent() == dest.deletingLastPathComponent(),
        temp.lastPathComponent.hasPrefix(".ocr2md-v3-"),
        !expected.isEmpty,
        isRegularFile(dest),
        isRegularFile(temp) else {
    throw SafeReplaceError.invalid("unapproved destination or temporary source")
  }
  let coordinator = NSFileCoordinator(filePresenter: nil)
  var coordinationError: NSError?
  var operationError: Error?
  coordinator.coordinate(writingItemAt: dest, options: .forReplacing,
                         error: &coordinationError) { coordinated in
    do {
      guard coordinated.standardizedFileURL == dest else {
        throw SafeReplaceError.invalid("coordinator redirected target")
      }
      guard try revision(at: dest) == expected else {
        throw SafeReplaceError.stale
      }
      // Atomic rename inside coordinated write boundary. The temp file was
      // fsync'd by Python and created in the SAME directory and filesystem.
      guard rename(temp.path, dest.path) == 0 else {
        throw SafeReplaceError.system("atomic rename failed errno=\(errno)")
      }
      // If directory fsync isn't supported by iCloud FS, don't claim full
      // crash recovery. The service checks the target hash after returning.
      let fd = open(dest.deletingLastPathComponent().path, O_RDONLY)
      if fd >= 0 {
        _ = fsync(fd)
        _ = close(fd)
      }
    } catch {
      operationError = error
    }
  }
  if let operationError { throw operationError }
  if let coordinationError { throw SafeReplaceError.coordination(coordinationError.localizedDescription) }
  print("COORDINATED_CAS_OK")
}

do {
  try run()
} catch {
  let message = String(describing: error)
  fputs(message + "\n", stderr)
  exit(message.hasPrefix("ESTALE") ? 42 : 1)
}
