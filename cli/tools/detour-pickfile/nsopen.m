/*
 * detour-pickfile — native macOS NSOpenPanel for Databases Browse.
 * Compiled at Install Helper time (clang -framework AppKit).
 *
 * Usage: detour-pickfile [-title string] [-filter name:ext1,ext2]...
 * Cancel → empty stdout, exit 0. Path → stdout. Failures → stderr + exit 1.
 *
 * Accessory activation + active-Space collection behavior so the panel overlays
 * the current Mission Control Space (maximized Chrome) without switching desktops.
 * Light activateIgnoringOtherApps keeps the panel key without ActivateAllWindows.
 */
#import <AppKit/AppKit.h>
#import <Foundation/Foundation.h>

static NSArray<NSString *> *ParseExtensions(NSArray<NSString *> *filters) {
  NSMutableArray<NSString *> *exts = [NSMutableArray array];
  NSMutableSet<NSString *> *seen = [NSMutableSet set];
  for (NSString *raw in filters) {
    NSRange colon = [raw rangeOfString:@":"];
    if (colon.location == NSNotFound) {
      continue;
    }
    NSString *extCSV = [raw substringFromIndex:colon.location + 1];
    for (NSString *piece in [extCSV componentsSeparatedByString:@","]) {
      NSString *e = [piece stringByTrimmingCharactersInSet:
                         [NSCharacterSet whitespaceAndNewlineCharacterSet]];
      while ([e hasPrefix:@"."]) {
        e = [e substringFromIndex:1];
      }
      if (e.length == 0 || [seen containsObject:e]) {
        continue;
      }
      [seen addObject:e];
      [exts addObject:e];
    }
  }
  return exts;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSString *title = @"Select file";
    NSMutableArray<NSString *> *filterArgs = [NSMutableArray array];

    for (int i = 1; i < argc; i++) {
      NSString *a = [NSString stringWithUTF8String:argv[i]];
      if ([a isEqualToString:@"-title"] && i + 1 < argc) {
        title = [NSString stringWithUTF8String:argv[++i]];
      } else if ([a hasPrefix:@"-title="]) {
        title = [a substringFromIndex:7];
      } else if ([a isEqualToString:@"-filter"] && i + 1 < argc) {
        [filterArgs addObject:[NSString stringWithUTF8String:argv[++i]]];
      } else if ([a hasPrefix:@"-filter="]) {
        [filterArgs addObject:[a substringFromIndex:8]];
      } else if ([a isEqualToString:@"-h"] || [a isEqualToString:@"--help"]) {
        fputs("usage: detour-pickfile [-title string] [-filter name:ext1,ext2]...\n",
              stderr);
        return 0;
      }
    }

    /* Accessory: not a Space-owning app. Still finishLaunching + light activate. */
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [NSApp finishLaunching];
    [NSApp activateIgnoringOtherApps:YES];

    NSOpenPanel *panel = [NSOpenPanel openPanel];
    [panel setCanChooseFiles:YES];
    [panel setCanChooseDirectories:NO];
    [panel setAllowsMultipleSelection:NO];
    [panel setCanCreateDirectories:NO];
    [panel setMessage:title];
    [panel setTitle:@"Select file"];
    [panel setLevel:NSModalPanelWindowLevel];
    [panel setFloatingPanel:YES];
    /* Overlay the Space where Chrome is (incl. maximized / fullscreen). */
    [panel setCollectionBehavior:(NSWindowCollectionBehaviorCanJoinAllSpaces |
                                  NSWindowCollectionBehaviorMoveToActiveSpace |
                                  NSWindowCollectionBehaviorFullScreenAuxiliary)];

    NSArray<NSString *> *exts = ParseExtensions(filterArgs);
    if (exts.count > 0) {
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wdeprecated-declarations"
      /* allowedContentTypes needs UniformTypeIdentifiers; keep extensions for broad macOS. */
      [panel setAllowedFileTypes:exts];
#pragma clang diagnostic pop
    }

    [panel center];
    [panel makeKeyAndOrderFront:nil];
    /* No ActivateAllWindows option — that switches Mission Control Spaces. */
    [NSApp activateIgnoringOtherApps:YES];

    NSModalResponse result = [panel runModal];
    if (result == NSModalResponseOK) {
      NSURL *url = panel.URLs.firstObject;
      if (url != nil) {
        fputs(url.path.UTF8String, stdout);
      }
    }
    return 0;
  }
}
