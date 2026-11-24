"""Fit the lower support, oriented toward the observed surface normals."""
import numpy as np


def support_plane(points, surface_normal, weights=None):
    points=np.asarray(points,dtype=float)
    if points.ndim!=2 or points.shape[1]!=3 or len(points)<3 or not np.isfinite(points).all():raise ValueError('CAPTURE_QUALITY')
    diagonal=float(np.linalg.norm(np.ptp(points,axis=0)))
    if not np.isfinite(diagonal) or diagonal<=0:raise ValueError('CAPTURE_QUALITY')
    if np.linalg.norm(surface_normal)<1e-10:raise ValueError('RECAPTURE_BACKGROUND')
    random=np.random.default_rng(13)
    if weights is not None:
        weights=np.asarray(weights,dtype=float)
        if weights.shape!=(len(points),) or not np.isfinite(weights).all() or np.any(weights<0) or weights.sum()<=0:raise ValueError('CAPTURE_QUALITY')
        sample=points[random.choice(len(points),5000,replace=True,p=weights/weights.sum())]
    else:sample=points[random.choice(len(points),min(len(points),5000),replace=False)]
    threshold=diagonal*.008
    best=None
    for _ in range(1200):
        a,b,c=sample[random.choice(len(sample),3,replace=False)]
        normal=np.cross(b-a,c-a);norm=np.linalg.norm(normal)
        if norm<1e-10:continue
        normal/=norm
        if np.dot(normal,surface_normal)<0:normal=-normal
        distance=-np.dot(normal,a);signed=sample@normal+distance
        # A food surface is not the support: reject planes cutting through it.
        if np.mean(signed < -threshold)>.08 or np.quantile(signed,.98)<threshold*4:continue
        inliers=np.abs(signed)<threshold
        fraction=float(np.mean(inliers))
        if fraction<.15:continue
        # A plate can hide most of its support. Penalize slices through the
        # object instead of requiring the table to contain 25% of all vertices.
        score=fraction-2*float(np.mean(signed < -threshold))
        if best is None or score>best[0]:best=(score,normal.copy(),float(distance),inliers)
    if best is None:raise ValueError('RECAPTURE_BACKGROUND')
    normal,distance=best[1:3]
    # Refine only the selected lower surface; never refit to the food above it.
    inliers=sample[best[3]];center=inliers.mean(axis=0)
    _,_,axes=np.linalg.svd(inliers-center,full_matrices=False)
    refined=axes[-1]
    if refined@surface_normal<0:refined=-refined
    offset=float(-refined@center);signed=sample@refined+offset
    if np.mean(signed < -threshold)<=.08 and np.quantile(signed,.98)>=threshold*4:
        normal,distance=refined,offset
    return normal,distance,threshold
