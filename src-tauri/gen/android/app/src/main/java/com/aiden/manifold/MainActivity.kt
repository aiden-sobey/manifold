package com.aiden.manifold

import android.app.SearchManager
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import org.json.JSONTokener

class MainActivity : TauriActivity() {
  private val webSearchItemId = View.generateViewId()
  private var webView: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
  }

  override fun onActionModeStarted(mode: ActionMode) {
    super.onActionModeStarted(mode)
    val currentWebView = webView ?: return
    val menu = mode.menu

    // Only augment WebView text-selection modes. Leave unrelated native action modes alone.
    val isTextSelection = currentWebView.hasFocus() && (
      menu.findItem(android.R.id.copy) != null ||
        menu.findItem(android.R.id.cut) != null ||
        menu.findItem(android.R.id.selectAll) != null
      )
    if (!isTextSelection) return

    val item = menu.findItem(webSearchItemId)
      ?: menu.add(Menu.NONE, webSearchItemId, Menu.NONE, "Web Search")
    item.setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
    item.setOnMenuItemClickListener {
      readSelectionAndSearch(currentWebView, mode)
      true
    }
  }

  private fun readSelectionAndSearch(webView: WebView, mode: ActionMode) {
    val script = """
      (() => {
        const e = document.activeElement;
        if (e && (e instanceof HTMLTextAreaElement ||
                  (e instanceof HTMLInputElement &&
                   /^(text|search|url|tel|email)$/i.test(e.type)))) {
          const a = e.selectionStart, b = e.selectionEnd;
          if (typeof a === 'number' && typeof b === 'number' && b > a) {
            return e.value.substring(a, b);
          }
        }
        const selection = window.getSelection();
        return selection ? selection.toString() : '';
      })()
    """.trimIndent()

    webView.evaluateJavascript(script) { encoded ->
      mode.finish()
      if (isFinishing || isDestroyed) return@evaluateJavascript
      val selected = try {
        JSONTokener(encoded).nextValue() as? String
      } catch (_: Exception) {
        null
      } ?: return@evaluateJavascript
      if (selected.isNotBlank()) launchWebSearch(selected)
    }
  }

  private fun launchWebSearch(rawQuery: String) {
    var query = if (rawQuery.length <= MAX_QUERY_LENGTH) {
      rawQuery
    } else {
      rawQuery.substring(0, MAX_QUERY_LENGTH)
    }
    if (query.lastOrNull()?.isHighSurrogate() == true) query = query.dropLast(1)

    try {
      startActivity(Intent(Intent.ACTION_WEB_SEARCH).apply {
        putExtra(SearchManager.QUERY, query)
      })
      return
    } catch (_: ActivityNotFoundException) {
      // Fall back to a browser when no native search provider is installed.
    } catch (_: SecurityException) {
      // Treat an inaccessible provider the same as a missing provider.
    }

    val uri = Uri.Builder()
      .scheme("https")
      .authority("www.google.com")
      .path("search")
      .appendQueryParameter("q", query)
      .build()
    try {
      startActivity(Intent(Intent.ACTION_VIEW, uri))
    } catch (_: ActivityNotFoundException) {
      // No browser is available; leave the selection action as a no-op.
    } catch (_: SecurityException) {
      // A malformed or inaccessible browser handler must not crash the app.
    }
  }

  override fun onDestroy() {
    webView = null
    super.onDestroy()
  }

  companion object {
    private const val MAX_QUERY_LENGTH = 8192
  }
}
