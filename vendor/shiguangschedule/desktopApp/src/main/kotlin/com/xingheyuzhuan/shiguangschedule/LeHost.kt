// Added by Le: embeds the upstream Compose App in the host's native client area.
package com.xingheyuzhuan.shiguangschedule

import androidx.compose.ui.awt.ComposePanel
import com.sun.jna.Native
import com.sun.jna.Pointer
import com.sun.jna.win32.StdCallLibrary
import com.sun.jna.platform.win32.User32
import com.sun.jna.platform.win32.WinDef.HWND
import com.sun.jna.platform.win32.WinUser
import kotlinx.serialization.json.*
import java.awt.BorderLayout
import java.awt.event.MouseAdapter
import java.awt.event.MouseEvent
import javax.swing.JFrame
import javax.swing.SwingUtilities
import kotlin.concurrent.thread
import kotlin.system.exitProcess

private interface WindowHierarchy : StdCallLibrary { fun GetParent(child: HWND): HWND? }

fun runLeHost(parentHandle: Long) {
    require(System.getProperty("os.name").startsWith("Windows")) { "Native embedding requires Windows" }
    val parent = HWND(Pointer(parentHandle))
    require(User32.INSTANCE.IsWindow(parent)) { "Host window no longer exists" }
    SwingUtilities.invokeLater {
        val composePanel = ComposePanel().apply {
            isFocusable = true
            focusTraversalKeysEnabled = false
            setContent { DesktopApp() }
            addMouseListener(object : MouseAdapter() {
                override fun mouseEntered(event: MouseEvent) { requestFocusInWindow() }
                override fun mousePressed(event: MouseEvent) { requestFocusInWindow() }
            })
        }
        val frame = JFrame("时光课程表").apply {
            isUndecorated = true
            defaultCloseOperation = JFrame.DISPOSE_ON_CLOSE
            layout = BorderLayout()
            add(composePanel, BorderLayout.CENTER)
            setSize(800, 600)
            addNotify()
        }
        val child = HWND(Native.getComponentPointer(frame))
        val style = User32.INSTANCE.GetWindowLong(child, WinUser.GWL_STYLE)
        User32.INSTANCE.SetWindowLong(child, WinUser.GWL_STYLE,
            (style and WinUser.WS_POPUP.inv()) or WinUser.WS_CHILD or WinUser.WS_CLIPSIBLINGS)
        User32.INSTANCE.SetParent(child, parent)
        check(Native.load("user32", WindowHierarchy::class.java).GetParent(child) == parent) {
            "Could not attach original UI to host"
        }
        println("LE_READY")
        System.out.flush()
        thread(name = "letime-host-control", isDaemon = true) {
            try {
                System.`in`.bufferedReader().forEachLine { line ->
                    val message = Json.parseToJsonElement(line).jsonObject
                    SwingUtilities.invokeLater {
                        if (message["visible"]?.jsonPrimitive?.booleanOrNull == false) {
                            frame.isVisible = false
                        } else {
                            val x = message["x"]?.jsonPrimitive?.intOrNull ?: 0
                            val y = message["y"]?.jsonPrimitive?.intOrNull ?: 0
                            val width = (message["width"]?.jsonPrimitive?.intOrNull ?: 800).coerceIn(1, 16384)
                            val height = (message["height"]?.jsonPrimitive?.intOrNull ?: 600).coerceIn(1, 16384)
                            // Host sends physical client pixels; MoveWindow preserves monitor DPI alignment.
                            frame.isVisible = true
                            User32.INSTANCE.MoveWindow(child, x, y, width, height, true)
                            frame.validate()
                        }
                    }
                }
            } finally {
                SwingUtilities.invokeLater { frame.dispose(); exitProcess(0) }
            }
        }
    }
}
