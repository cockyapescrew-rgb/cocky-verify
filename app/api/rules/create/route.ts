import { NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabase";

type Requirement = {
  requirement_type: string;
  issuer?: string;
  taxon?: string;
  min_nft_count?: number;
  trait_type?: string;
  trait_value?: string;
  token_currency?: string;
  token_issuer?: string;
  min_token_amount?: number;
  logic?: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      project_id,
      discord_role_id,
      role_name,
      requirements = [],
    }: {
      project_id: string;
      discord_role_id: string;
      role_name: string;
      requirements: Requirement[];
    } = body;

    if (!project_id || !discord_role_id || !role_name) {
      return NextResponse.json(
        { error: "Missing project_id, discord_role_id, or role_name" },
        { status: 400 }
      );
    }

    if (!requirements.length) {
      return NextResponse.json(
        { error: "At least one requirement is required" },
        { status: 400 }
      );
    }

    const { data: rule, error: ruleError } = await supabase
      .from("role_rules")
      .insert({
        project_id,
        discord_role_id,
        role_name,
        rule_type: "multi_requirement",
      })
      .select()
      .single();

    if (ruleError || !rule) {
      return NextResponse.json(
        { error: ruleError?.message || "Failed to create role rule" },
        { status: 500 }
      );
    }

    const requirementRows = requirements.map((req) => ({
      role_rule_id: rule.id,
      requirement_type: req.requirement_type,
      issuer: req.issuer || null,
      taxon: req.taxon || null,
      min_nft_count: req.min_nft_count || 1,
      trait_type: req.trait_type || null,
      trait_value: req.trait_value || null,
      token_currency: req.token_currency || null,
      token_issuer: req.token_issuer || null,
      min_token_amount: req.min_token_amount || null,
      logic: req.logic || "OR",
    }));

    const { data: savedRequirements, error: reqError } = await supabase
      .from("role_rule_requirements")
      .insert(requirementRows)
      .select();

    if (reqError) {
      return NextResponse.json(
        { error: reqError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rule,
      requirements: savedRequirements,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to create rule" },
      { status: 500 }
    );
  }
}