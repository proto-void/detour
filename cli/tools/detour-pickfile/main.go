// Command detour-pickfile opens a native file dialog and prints the path.
// Sibling to the Node SEA host on Windows (avoids PowerShell cold start).
// Cancel → empty stdout, exit 0. Failures → stderr + exit 1.
//
//	detour-pickfile [-title string] [-filter name:ext1,ext2]...
package main

import (
	"fmt"
	"os"
	"strings"
)

func main() {
	title := "Select file"
	var filters []filter
	args := os.Args[1:]
	for i := 0; i < len(args); i++ {
		a := args[i]
		switch {
		case a == "-title" && i+1 < len(args):
			title = args[i+1]
			i++
		case strings.HasPrefix(a, "-title="):
			title = strings.TrimPrefix(a, "-title=")
		case a == "-filter" && i+1 < len(args):
			if f, ok := parseFilter(args[i+1]); ok {
				filters = append(filters, f)
			}
			i++
		case strings.HasPrefix(a, "-filter="):
			if f, ok := parseFilter(strings.TrimPrefix(a, "-filter=")); ok {
				filters = append(filters, f)
			}
		case a == "-h" || a == "--help":
			fmt.Fprintf(os.Stderr, "usage: detour-pickfile [-title string] [-filter name:ext1,ext2]...\n")
			os.Exit(0)
		}
	}

	path, err := pick(title, filters)
	if err != nil {
		fmt.Fprintf(os.Stderr, "detour-pickfile: %v\n", err)
		os.Exit(1)
	}
	if path != "" {
		fmt.Print(path)
	}
}

type filter struct {
	Name       string
	Extensions []string
}

func parseFilter(raw string) (filter, bool) {
	name, exts, ok := strings.Cut(raw, ":")
	if !ok {
		return filter{}, false
	}
	var extensions []string
	if exts != "" {
		for _, e := range strings.Split(exts, ",") {
			e = strings.TrimSpace(strings.TrimPrefix(e, "."))
			if e != "" {
				extensions = append(extensions, e)
			}
		}
	}
	return filter{Name: name, Extensions: extensions}, true
}
