import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [] as Array<Record<string, unknown>>,
  };

  try {
    // Step 1: Check if Authorization header is present
    const authHeader = req.headers.get("Authorization");
    diagnostics.steps.push({
      step: 1,
      name: "auth_header_check",
      hasAuth: !!authHeader,
      authHeaderPrefix: authHeader ? authHeader.substring(0, 20) + "..." : null,
    });

    if (!authHeader) {
      diagnostics.error = "No Authorization header";
      return new Response(JSON.stringify(diagnostics, null, 2), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 2: Create Supabase client with the user's auth token
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Step 3: Get the authenticated user
    const { data: userData, error: userError } = await supabase.auth.getUser();
    diagnostics.steps.push({
      step: 3,
      name: "get_user",
      success: !userError,
      error: userError?.message,
      userId: userData?.user?.id,
      userEmail: userData?.user?.email,
    });

    if (userError || !userData?.user) {
      diagnostics.error = "Failed to get authenticated user";
      return new Response(JSON.stringify(diagnostics, null, 2), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;

    // Step 4: Call get_pet() RPC
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_pet");
    diagnostics.steps.push({
      step: 4,
      name: "get_pet_rpc",
      success: !rpcError,
      error: rpcError?.message,
      dataType: typeof rpcData,
      dataIsArray: Array.isArray(rpcData),
      dataKeys: rpcData && typeof rpcData === "object" && !Array.isArray(rpcData)
        ? Object.keys(rpcData)
        : null,
      dataPreview: rpcData ? JSON.stringify(rpcData).substring(0, 500) : null,
    });

    // Step 5: Direct table query (what the frontend likely uses)
    const { data: tableData, error: tableError } = await supabase
      .from("user_pets")
      .select("*")
      .eq("user_id", userId)
      .single();
    diagnostics.steps.push({
      step: 5,
      name: "direct_table_query_single",
      success: !tableError,
      error: tableError?.message,
      errorCode: tableError?.code,
      dataType: typeof tableData,
      dataKeys: tableData ? Object.keys(tableData) : null,
      dataPreview: tableData ? JSON.stringify(tableData).substring(0, 500) : null,
    });

    // Step 6: Direct table query without .single()
    const { data: tableDataArray, error: tableArrayError } = await supabase
      .from("user_pets")
      .select("*")
      .eq("user_id", userId);
    diagnostics.steps.push({
      step: 6,
      name: "direct_table_query_array",
      success: !tableArrayError,
      error: tableArrayError?.message,
      rowCount: tableDataArray?.length,
      dataPreview: tableDataArray ? JSON.stringify(tableDataArray).substring(0, 500) : null,
    });

    // Step 7: Query the current_user_pet view
    const { data: viewData, error: viewError } = await supabase
      .from("current_user_pet")
      .select("*")
      .single();
    diagnostics.steps.push({
      step: 7,
      name: "current_user_pet_view",
      success: !viewError,
      error: viewError?.message,
      dataType: typeof viewData,
      dataKeys: viewData ? Object.keys(viewData) : null,
      dataPreview: viewData ? JSON.stringify(viewData).substring(0, 500) : null,
    });

    // Step 8: Compare response shapes
    if (rpcData && tableData) {
      const rpcKeys = Object.keys(rpcData).sort();
      const tableKeys = Object.keys(tableData).sort();
      const keysMatch = JSON.stringify(rpcKeys) === JSON.stringify(tableKeys);
      diagnostics.steps.push({
        step: 8,
        name: "shape_comparison",
        keysMatch,
        rpcKeys,
        tableKeys,
        rpcHasOutfit: "outfit" in rpcData,
        tableHasOutfit: "outfit" in tableData,
        rpcOutfitValue: rpcData.outfit,
        tableOutfitValue: tableData.outfit,
      });
    }

    // Step 9: Check for null fields that could cause frontend crashes
    if (tableData) {
      const nullFields: string[] = [];
      for (const [key, value] of Object.entries(tableData)) {
        if (value === null) {
          nullFields.push(key);
        }
      }
      diagnostics.steps.push({
        step: 9,
        name: "null_field_check",
        nullFields,
        couldCauseCrash: nullFields.length > 0,
      });
    }

    diagnostics.summary = {
      authUserId: userId,
      rpcSucceeded: !rpcError,
      tableQuerySucceeded: !tableError,
      viewQuerySucceeded: !viewError,
      allSucceeded: !rpcError && !tableError && !viewError,
    };

    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    diagnostics.error = `Exception: ${err instanceof Error ? err.message : String(err)}`;
    diagnostics.stack = err instanceof Error ? err.stack : null;
    return new Response(JSON.stringify(diagnostics, null, 2), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
