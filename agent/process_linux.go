package main

import "os/exec"

// Linux processes do not create a separate console window.
func hideConsoleWindow(cmd *exec.Cmd) {}
