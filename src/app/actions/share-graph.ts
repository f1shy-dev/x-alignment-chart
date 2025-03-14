"use server";

import { nanoid } from "nanoid";
import { getRedisClient } from "@/lib/redis";
import { StoredPlacement } from "@/lib/indexed-db";
import { logger } from "@/lib/logger";

const SHARE_PREFIX = "shared_graph:";
const SHARE_TTL = 60 * 60 * 24 * 30; // 30 days
const ANALYTICS_PREFIX = "analytics:share:";

export async function createShareLink(placements: StoredPlacement[]): Promise<string> {
    const startTime = Date.now();
    const shareId = nanoid(10);
    const key = `${SHARE_PREFIX}${shareId}`;

    logger.info({
        action: "share_graph_start",
        shareId,
        placementsCount: placements.length,
        usernames: placements.map(p => p.username).filter(Boolean)
    }, `Starting to create share link for ${placements.length} placements with ID: ${shareId}`);

    try {
        const redisClient = getRedisClient();
        const jsonData = JSON.stringify(placements);
        const dataSizeKb = Math.round(jsonData.length / 1024);

        logger.debug({
            action: "share_graph_data",
            shareId,
            dataSizeKb
        }, `Share data size: ${dataSizeKb}KB`);

        console.log(jsonData)
        await redisClient.set(key, jsonData, {
            ex: SHARE_TTL
        });

        const duration = Date.now() - startTime;
        logger.info({
            action: "share_graph_success",
            shareId,
            dataSizeKb,
            durationMs: duration
        }, `Successfully created share link in ${duration}ms. ID: ${shareId}`);

        return shareId;
    } catch (error) {
        const duration = Date.now() - startTime;
        logger.error({
            action: "share_graph_error",
            shareId,
            durationMs: duration,
            error
        }, `Failed to create share link for ID: ${shareId} after ${duration}ms`);
        throw new Error("Failed to create share link");
    }
}

export async function getSharedGraph(shareId: string): Promise<StoredPlacement[] | null> {
    const startTime = Date.now();
    const key = `${SHARE_PREFIX}${shareId}`;

    logger.info({
        action: "get_shared_graph_start",
        shareId
    }, `Starting to fetch shared graph with ID: ${shareId}`);

    try {
        const redisClient = getRedisClient();
        const data = await redisClient.get(key);

        if (!data) {
            logger.warn({
                action: "get_shared_graph_not_found",
                shareId,
                durationMs: Date.now() - startTime
            }, `Shared graph not found for ID: ${shareId}`);
            return null;
        }

        const parsedData = JSON.parse(data as string) as StoredPlacement[];

        const duration = Date.now() - startTime;

        logger.info({
            action: "get_shared_graph_success",
            shareId,
            placementsCount: parsedData.length,
            dataSizeKb: Math.round((data as string).length / 1024),
            durationMs: duration
        }, `Successfully fetched shared graph in ${duration}ms. ID: ${shareId}, Items: ${parsedData.length}`);

        return parsedData;
    } catch (error) {
        console.error(error)
        const duration = Date.now() - startTime;
        logger.error({

            action: "get_shared_graph_error",
            shareId,
            durationMs: duration,
            error
        }, `Failed to fetch shared graph for ID: ${shareId} after ${duration}ms`);
        return null;
    }
}
