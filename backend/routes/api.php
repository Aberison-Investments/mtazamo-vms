<?php

use App\Http\Controllers\AgentApplyController;
use App\Http\Controllers\AgentInviteController;
use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CampaignManagerController;
use App\Http\Controllers\ElectionRunController;
use App\Http\Controllers\GeographyController;
use App\Http\Controllers\InviteAcceptController;
use App\Http\Controllers\RecruitmentController;
use App\Http\Controllers\StationResultController;
use App\Http\Controllers\TierFormController;
use App\Http\Controllers\TierOfficerController;
use App\Http\Controllers\WarRoomController;
use App\Http\Controllers\WorkspaceAgentReviewController;
use App\Http\Controllers\WorkspaceCandidatesController;
use App\Http\Controllers\WorkspaceController;
use App\Http\Controllers\WorkspaceDelegationController;
use Illuminate\Support\Facades\Route;

// Account & Workspace flow — aspirant accounts, SMS-OTP second factor, workspaces.
Route::prefix('auth')->group(function () {
    Route::post('register', [AuthController::class, 'register']);
    Route::post('login', [AuthController::class, 'login']);
    Route::post('verify-otp', [AuthController::class, 'verifyOtp']);
    Route::post('resend-otp', [AuthController::class, 'resendOtp']);
    Route::post('refresh', [AuthController::class, 'refresh']);

    // Email verification link is opened from any device, so it authenticates by
    // token alone rather than a session.
    Route::post('email/verify', [AuthController::class, 'verifyEmail']);

    Route::middleware('auth.token')->group(function () {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
        Route::post('email/send', [AuthController::class, 'sendEmailVerification']);
        Route::post('email/change', [AuthController::class, 'changeEmail']);

        // Session management
        Route::get('sessions', [AuthController::class, 'sessions']);
        Route::delete('sessions/{tokenId}', [AuthController::class, 'revokeSession']);
        Route::post('sessions/revoke-all', [AuthController::class, 'revokeAll']);
    });
});

Route::middleware('auth.token')->group(function () {
    // Audit logs
    Route::get('workspaces/{id}/audit', [AuditLogController::class, 'index']);
    Route::get('auth/activity', [AuditLogController::class, 'myActivity']);

    Route::get('workspaces', [WorkspaceController::class, 'index']);
    Route::post('workspaces', [WorkspaceController::class, 'store']);
    Route::get('workspaces/{id}', [WorkspaceController::class, 'show']);
    Route::get('workspaces/{id}/stats', [WorkspaceController::class, 'stats']);
    Route::get('workspaces/{id}/geography', [GeographyController::class, 'workspaceSummary']);

    Route::get('workspaces/{id}/managers', [CampaignManagerController::class, 'index']);
    Route::post('workspaces/{id}/managers', [CampaignManagerController::class, 'store']);
    Route::post('workspaces/{id}/managers/{mid}/resend', [CampaignManagerController::class, 'resend']);
    Route::delete('workspaces/{id}/managers/{mid}', [CampaignManagerController::class, 'destroy']);

    Route::get('workspaces/{id}/recruitment', [RecruitmentController::class, 'index']);
    Route::get('workspaces/{id}/recruitment/stats', [RecruitmentController::class, 'stats']);
    Route::get('workspaces/{id}/recruitment/wards/{wardId}', [RecruitmentController::class, 'ward']);
    Route::patch('workspaces/{id}/recruitment/wards/{wardId}', [RecruitmentController::class, 'updateWard']);
    Route::post('workspaces/{id}/recruitment/wards/{wardId}/regenerate', [RecruitmentController::class, 'regenerate']);
    Route::get('workspaces/{id}/recruitment/invites', [RecruitmentController::class, 'listInvites']);
    Route::post('workspaces/{id}/recruitment/invites', [RecruitmentController::class, 'storeInvite']);

    Route::get('workspaces/{id}/agents/pending',                           [WorkspaceAgentReviewController::class, 'index']);
    Route::post('workspaces/{id}/agents/bulk-approve',                     [WorkspaceAgentReviewController::class, 'bulkApprove']);
    Route::get('workspaces/{id}/agents/assigned',                          [WorkspaceAgentReviewController::class, 'assignedWards']);
    Route::get('workspaces/{id}/agents/assigned/wards/{wardId}',           [WorkspaceAgentReviewController::class, 'assignedWard']);
    Route::get('workspaces/{id}/agents/{agentId}/stations',                [WorkspaceAgentReviewController::class, 'agentStations']);
    Route::post('workspaces/{id}/agents/{agentId}/approve',                [WorkspaceAgentReviewController::class, 'approve']);
    Route::post('workspaces/{id}/agents/{agentId}/reject',                 [WorkspaceAgentReviewController::class, 'reject']);
    Route::post('workspaces/{id}/agents/{agentId}/deploy',                 [WorkspaceAgentReviewController::class, 'deployAgent']);
    Route::post('workspaces/{id}/agents/{agentId}/reassign',               [WorkspaceAgentReviewController::class, 'reassignAgent']);

    Route::get('workspaces/{id}/geography/wards/{wardId}/stations', [GeographyController::class, 'workspaceWardStations']);

    Route::get('workspaces/{id}/candidates',          [WorkspaceCandidatesController::class, 'index']);
    Route::put('workspaces/{id}/candidates',          [WorkspaceCandidatesController::class, 'save']);
    Route::post('workspaces/{id}/candidates/publish', [WorkspaceCandidatesController::class, 'publish']);

    Route::get('workspaces/{id}/settings/delegation', [WorkspaceDelegationController::class, 'index']);
    Route::put('workspaces/{id}/settings/delegation', [WorkspaceDelegationController::class, 'upsert']);

    // Tier officer portal context
    Route::get('workspaces/{id}/tier/context', [TierOfficerController::class, 'context']);

    // Election runs
    Route::get('workspaces/{id}/runs',            [ElectionRunController::class, 'index']);
    Route::post('workspaces/{id}/runs',           [ElectionRunController::class, 'store']);
    Route::patch('workspaces/{id}/runs/{runId}',  [ElectionRunController::class, 'update']);

    // War room
    Route::get('workspaces/{id}/warroom/summary',                                      [WarRoomController::class, 'summary']);
    Route::post('workspaces/{id}/runs/{runId}/results/{resultId}/verify',              [WarRoomController::class, 'verifyResult']);
    Route::post('workspaces/{id}/runs/{runId}/results/{resultId}/query',               [WarRoomController::class, 'queryResult']);
    Route::post('workspaces/{id}/runs/{runId}/results/{resultId}/amend',               [WarRoomController::class, 'amendResult']);

    // Tier form submissions (Form 34B / 37B / 35B etc.)
    Route::get('workspaces/{id}/runs/{runId}/tier-form',         [TierFormController::class, 'show']);
    Route::post('workspaces/{id}/runs/{runId}/tier-form/save',   [TierFormController::class, 'save']);
    Route::post('workspaces/{id}/runs/{runId}/tier-form/submit', [TierFormController::class, 'submit']);
    Route::post('workspaces/{id}/tier-form/upload-image',        [TierFormController::class, 'uploadImage']);

    // Station results (polling agent)
    Route::get('workspaces/{id}/station/context',     [StationResultController::class, 'context']);
    Route::post('workspaces/{id}/station/result-otp', [StationResultController::class, 'sendResultOtp']);
    Route::post('workspaces/{id}/station/results',    [StationResultController::class, 'store']);
});

// Campaign manager invite accept — public, no auth.
Route::get('join/{token}', [InviteAcceptController::class, 'show']);
Route::post('join/{token}/request-otp', [InviteAcceptController::class, 'requestOtp']);
Route::post('join/{token}/accept', [InviteAcceptController::class, 'accept']);
Route::post('join/{token}/setup', [InviteAcceptController::class, 'setup']);
Route::post('join/{token}/decline', [InviteAcceptController::class, 'decline']);

// Agent targeted invite accept — public, no auth.
Route::get('join/agent/{token}', [AgentInviteController::class, 'show']);
Route::post('join/agent/{token}/request-otp', [AgentInviteController::class, 'requestOtp']);
Route::post('join/agent/{token}/accept', [AgentInviteController::class, 'accept']);
Route::post('join/agent/{token}/setup', [AgentInviteController::class, 'setup']);
Route::post('join/agent/{token}/decline', [AgentInviteController::class, 'decline']);

// Agent public-link apply — public, no auth.
Route::get('apply/{token}', [AgentApplyController::class, 'show']);
Route::post('apply/{token}/request-otp', [AgentApplyController::class, 'requestOtp']);
Route::post('apply/{token}/submit', [AgentApplyController::class, 'submit']);
Route::post('apply/agent/{agentId}/setup', [AgentApplyController::class, 'setup']);

// Geography subsection (3.3) — read-only station register + add-missing-station.
Route::prefix('geography')->group(function () {
    Route::get('counties', [GeographyController::class, 'counties']);
    Route::get('counties/geojson', [GeographyController::class, 'allCountiesGeojson']);
    Route::get('counties/{countyId}/tree', [GeographyController::class, 'tree']);
    Route::get('counties/{countyId}/geojson', [GeographyController::class, 'countyGeojson']);
    Route::get('constituencies/{constituencyId}/wards', [GeographyController::class, 'wardsByConstituency']);
    Route::get('constituencies/{constituencyId}/geojson', [GeographyController::class, 'constituencyGeojson']);
    Route::get('wards/{wardId}/stations', [GeographyController::class, 'stations']);
    Route::post('wards/{wardId}/stations', [GeographyController::class, 'addStation']);
    Route::get('wards/{wardId}/stations.csv', [GeographyController::class, 'exportStations']);
});
