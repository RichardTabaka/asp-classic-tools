<!-- #include file="common.asp" -->
<%
' Helpers for admin.asp only. This file is never included from index.asp's
' tree, so it demonstrates on-demand indexing directly: with
' aspClassicTools.eagerIndex off (the default), nothing here is parsed until
' admin.asp itself gets opened or saved at least once.

Function IsAdmin(u)
  IsAdmin = (u = "user-42")
End Function

Function Helper()
  Helper = "admin helper"
End Function
%>
